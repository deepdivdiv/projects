package com.snet.musicapk;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;

/** 백그라운드 재생, 알림바, 잠금화면, 블루투스 버튼을 담당한다. */
public class PlaybackService extends MediaSessionService {

    /** 화면에서 고른 배속. DefaultAudioSink가 8배로 잘라내는 값을 SpeedChain이 되살릴 때 쓴다. */
    static volatile float requestedSpeed = 1f;

    /** 취침 시간이 이만큼 남으면 소리를 서서히 줄인다. */
    static final long SLEEP_FADE_MS = 15000;
    private static final long SAVE_INTERVAL_MS = 2000;

    /** 같은 프로세스의 플러그인이 취침 타이머와 위치 저장을 부르는 통로. */
    static volatile PlaybackService instance;
    /** 재생 중인 목록의 폴더. 곡 위치를 폴더별 마지막 곡과 함께 저장할 때 쓴다. */
    static volatile String queueFolder;

    private MediaSession session;
    private ExoPlayer exo;
    private ResumeStore resume;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long sleepDeadline;
    private boolean sleepAtEnd;

    private final Runnable saver = new Runnable() {
        @Override
        public void run() {
            saveNow();
            if (exo != null && exo.isPlaying()) {
                main.postDelayed(this, SAVE_INTERVAL_MS);
            }
        }
    };

    private final Runnable sleepTick = new Runnable() {
        @Override
        public void run() {
            long left = sleepLeft();
            if (exo == null || sleepDeadline == 0) {
                return;
            }
            if (left <= 0) {
                exo.pause();
                setSleep(0, false);
                return;
            }
            exo.setVolume(sleepVolume(left));
            main.postDelayed(this, 500);
        }
    };

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            main.removeCallbacks(saver);
            if (isPlaying) {
                main.postDelayed(saver, SAVE_INTERVAL_MS);
            } else {
                saveNow();
            }
        }

        @Override
        public void onPositionDiscontinuity(
            @NonNull Player.PositionInfo oldPosition,
            @NonNull Player.PositionInfo newPosition,
            int reason
        ) {
            if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION && oldPosition.mediaItem != null) {
                resume.clear(oldPosition.mediaItem.mediaId);
            }
            saveNow();
        }

        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_ENDED) {
                saveNow();
            }
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                setSleep(0, false);
            }
        }
    };

    /** 남은 시간에 따른 음량. 끝나기 직전까지 서서히 줄인다. */
    static float sleepVolume(long leftMs) {
        return leftMs >= SLEEP_FADE_MS ? 1f : Math.max(0f, (float) leftMs / SLEEP_FADE_MS);
    }

    void saveNow() {
        if (exo == null) {
            return;
        }
        MediaItem item = exo.getCurrentMediaItem();
        if (item == null) {
            return;
        }
        int next = exo.getCurrentMediaItemIndex() + 1;
        String nextUri = next < exo.getMediaItemCount() ? exo.getMediaItemAt(next).mediaId : null;
        resume.save(queueFolder, item.mediaId, exo.getCurrentPosition(), exo.getDuration(), nextUri);
    }

    /** minutes 대신 밀리초로 받는다. 0이고 endOfTrack이 아니면 끈다. */
    void setSleep(long delayMs, boolean endOfTrack) {
        main.removeCallbacks(sleepTick);
        sleepDeadline = delayMs > 0 ? SystemClock.elapsedRealtime() + delayMs : 0;
        sleepAtEnd = endOfTrack;
        if (exo != null) {
            exo.setVolume(1f);
            exo.setPauseAtEndOfMediaItems(endOfTrack);
        }
        if (sleepDeadline != 0) {
            main.post(sleepTick);
        }
    }

    long sleepLeft() {
        return sleepDeadline == 0 ? 0 : Math.max(0, sleepDeadline - SystemClock.elapsedRealtime());
    }

    boolean sleepAtEnd() {
        return sleepAtEnd;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        requestedSpeed = 1f;
        resume = new ResumeStore(this);
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
            @Override
            protected AudioSink buildAudioSink(
                @NonNull Context context,
                boolean enableFloatOutput,
                boolean enableAudioTrackPlaybackParams
            ) {
                return new DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(enableFloatOutput)
                    .setAudioProcessorChain(new SpeedChain())
                    .build();
            }
        };
        exo = new ExoPlayer.Builder(this, renderers, new DefaultMediaSourceFactory(new ZipDataSource.Factory(this)))
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            // 화면이 꺼져도 재생과 취침 타이머가 멈추지 않게 CPU를 깨워 둔다.
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build();
        exo.addListener(listener);
        session = new MediaSession.Builder(this, exo).setCallback(new Callback()).build();
        instance = this;
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        saveNow();
        Player player = session.getPlayer();
        if (!player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        saveNow();
        main.removeCallbacksAndMessages(null);
        instance = null;
        exo = null;
        session.getPlayer().release();
        session.release();
        session = null;
        super.onDestroy();
    }

    /**
     * DefaultAudioSink는 배속을 MAX_PLAYBACK_SPEED(8배)로 제한하지만 실제 처리기(Sonic)에는 상한이 없다.
     * 잘린 값이 들어오면 요청 배속으로 바꿔 넘겨서 16배를 가능하게 한다.
     */
    static final class SpeedChain implements DefaultAudioSink.AudioProcessorChain {
        private final DefaultAudioSink.DefaultAudioProcessorChain delegate =
            new DefaultAudioSink.DefaultAudioProcessorChain(new EqProcessor());

        @NonNull
        @Override
        public AudioProcessor[] getAudioProcessors() {
            return delegate.getAudioProcessors();
        }

        @NonNull
        @Override
        public PlaybackParameters applyPlaybackParameters(@NonNull PlaybackParameters parameters) {
            float speed = parameters.speed >= DefaultAudioSink.MAX_PLAYBACK_SPEED ? requestedSpeed : parameters.speed;
            return delegate.applyPlaybackParameters(new PlaybackParameters(speed, parameters.pitch));
        }

        @Override
        public boolean applySkipSilenceEnabled(boolean skipSilenceEnabled) {
            return delegate.applySkipSilenceEnabled(skipSilenceEnabled);
        }

        @Override
        public long getMediaDuration(long playoutDuration) {
            return delegate.getMediaDuration(playoutDuration);
        }

        @Override
        public long getSkippedOutputFrameCount() {
            return delegate.getSkippedOutputFrameCount();
        }
    }

    /** 컨트롤러를 거치며 URI가 빠져도 재생되도록 mediaId(URI)에서 복원한다. */
    private static class Callback implements MediaSession.Callback {
        @NonNull
        @Override
        public ListenableFuture<List<MediaItem>> onAddMediaItems(
            @NonNull MediaSession mediaSession,
            @NonNull MediaSession.ControllerInfo controller,
            @NonNull List<MediaItem> mediaItems
        ) {
            List<MediaItem> resolved = new ArrayList<>(mediaItems.size());
            for (MediaItem item : mediaItems) {
                resolved.add(item.buildUpon().setUri(item.mediaId).build());
            }
            return Futures.immediateFuture(resolved);
        }
    }
}
