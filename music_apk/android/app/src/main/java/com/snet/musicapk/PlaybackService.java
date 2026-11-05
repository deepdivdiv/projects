package com.snet.musicapk;

import android.content.Context;
import android.content.Intent;
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

    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        requestedSpeed = 1f;
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
        ExoPlayer player = new ExoPlayer.Builder(this, renderers, new DefaultMediaSourceFactory(new ZipDataSource.Factory(this)))
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .build();
        session = new MediaSession.Builder(this, player).setCallback(new Callback()).build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        Player player = session.getPlayer();
        if (!player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
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
