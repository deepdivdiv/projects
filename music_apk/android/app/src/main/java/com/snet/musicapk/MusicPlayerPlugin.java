package com.snet.musicapk;

import android.Manifest;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaDataSource;
import android.media.MediaMetadataRetriever;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.util.Consumer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "MusicPlayer",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MusicPlayerPlugin extends Plugin {

    private static final long TICK_MS = 500;
    private static final int THUMB_SIZE = 144;
    private static final int MAX_IMPORT_BYTES = 10 * 1024 * 1024;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService thumbs = Executors.newFixedThreadPool(2);
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            emitState();
            if (controller != null && controller.isPlaying()) {
                main.postDelayed(this, TICK_MS);
            }
        }
    };

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onEvents(Player player, Player.Events events) {
            main.removeCallbacks(ticker);
            ticker.run();
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            notifyListeners("playError", new JSObject());
        }
    };

    @Override
    public void load() {
        SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), PlaybackService.class));
        controllerFuture = new MediaController.Builder(getContext(), token).buildAsync();
        controllerFuture.addListener(
            () -> {
                try {
                    controller = controllerFuture.get();
                    controller.addListener(listener);
                    ticker.run();
                } catch (Exception ignored) {
                    controller = null;
                }
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacks(ticker);
        thumbs.shutdownNow();
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        controller = null;
    }

    private void withController(PluginCall call, Consumer<MediaController> action) {
        controllerFuture.addListener(
            () -> {
                if (controller == null) {
                    call.reject("플레이어에 연결하지 못했습니다.");
                    return;
                }
                action.accept(controller);
                call.resolve();
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    private void emitState() {
        if (controller == null || controller.getMediaItemCount() == 0) {
            return;
        }
        JSObject state = new JSObject();
        long duration = controller.getDuration();
        state.put("index", controller.getCurrentMediaItemIndex());
        state.put("position", controller.getCurrentPosition());
        state.put("duration", Math.max(duration, 0));
        state.put("speed", PlaybackService.requestedSpeed);
        MediaItem current = controller.getCurrentMediaItem();
        if (current != null) {
            state.put("uri", current.mediaId);
        }
        PlaybackService service = PlaybackService.instance;
        state.put("sleepLeft", service == null ? 0 : service.sleepLeft());
        state.put("sleepEnd", service != null && service.sleepAtEnd());
        state.put("playing", controller.getPlayWhenReady()
            && controller.getPlaybackState() != Player.STATE_ENDED
            && controller.getPlaybackState() != Player.STATE_IDLE);
        notifyListeners("state", state);
    }

    // ---- 권한 ----

    private boolean hasFileAccess() {
        if (BuildConfig.STORE) {
            return !TreeBrowser.roots(getContext()).isEmpty();
        }
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? Environment.isExternalStorageManager()
            : getPermissionState("storage") == PermissionState.GRANTED;
    }

    private void resolveAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasFileAccess());
        result.put("store", BuildConfig.STORE);
        result.put("version", BuildConfig.VERSION_NAME);
        call.resolve(result);
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        resolveAccess(call);
    }

    /** ZIP과 폴더를 그대로 보려면 '모든 파일 접근'이 필요하고, 이 권한은 설정 화면에서만 켤 수 있다. */
    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (BuildConfig.STORE) {
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                .putExtra(Intent.EXTRA_LOCAL_ONLY, true)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(call, picker, "folderPicked");
        } else if (hasFileAccess()) {
            resolveAccess(call);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            startActivityForResult(call, intent, "accessResult");
        } else {
            requestPermissionForAlias("storage", call, "accessCallback");
        }
    }

    /** 앱을 다시 켜도 쓸 수 있도록 권한을 저장해 둔다. */
    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (data != null && data.getData() != null) {
            getContext().getContentResolver().takePersistableUriPermission(data.getData(), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        resolveAccess(call);
    }

    @PluginMethod
    public void removeFolder(PluginCall call) {
        String tree = call.getString("tree");
        if (tree != null) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(tree), Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // 이미 끊긴 연결이다.
            }
        }
        resolveAccess(call);
    }

    @ActivityCallback
    private void accessResult(PluginCall call, ActivityResult result) {
        resolveAccess(call);
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        resolveAccess(call);
    }

    // ---- 라이브러리 ----

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
    }

    /** 개인용은 모든 파일 접근으로 읽고, 스토어 버전은 오디오 읽기 권한이 따로 필요하다. */
    private boolean hasLibraryAccess() {
        return BuildConfig.STORE ? getPermissionState(audioAlias()) == PermissionState.GRANTED : hasFileAccess();
    }

    @PluginMethod
    public void getLibrary(PluginCall call) {
        new Thread(() -> {
            JSObject result = new JSObject();
            if (!hasLibraryAccess()) {
                result.put("denied", true);
                call.resolve(result);
                return;
            }
            try {
                result.put("tracks", LibraryScanner.scan(getContext()));
                call.resolve(result);
            } catch (Exception e) {
                call.reject("음악 목록을 읽지 못했습니다.");
            }
        }).start();
    }

    @PluginMethod
    public void requestAudio(PluginCall call) {
        if (hasLibraryAccess() || !BuildConfig.STORE) {
            audioCallback(call);
        } else {
            requestPermissionForAlias(audioAlias(), call, "audioCallback");
        }
    }

    @PermissionCallback
    private void audioCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", hasLibraryAccess()));
    }

    // ---- 시스템 글꼴 ----

    @PluginMethod
    public void getSystemFonts(PluginCall call) {
        if (!SystemFontExporter.supported()) {
            call.resolve(new JSObject().put("fonts", new JSArray()));
            return;
        }
        main.post(() -> {
            try {
                List<Object> found = SystemFontExporter.find(getActivity());
                new Thread(() -> {
                    try {
                        call.resolve(SystemFontExporter.export(getContext(), found));
                    } catch (Exception e) {
                        call.reject("글꼴을 읽지 못했습니다.");
                    }
                }).start();
            } catch (RuntimeException e) {
                call.reject("글꼴을 찾지 못했습니다.");
            }
        });
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
        }
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        call.resolve();
    }

    // ---- 파일 탐색 ----

    @PluginMethod
    public void listDir(PluginCall call) {
        String path = call.getString("path");
        new Thread(() -> {
            try {
                call.resolve(FileBrowser.list(getContext(), path, () -> notifyListeners("zipBusy", new JSObject())));
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "폴더를 읽지 못했습니다." : e.getMessage());
            }
        }).start();
    }

    /** 1, 2, 10 순서가 되도록 숫자를 값으로 비교한다. */
    static Comparator<String> naturalOrder() {
        return (a, b) -> {
            int i = 0, j = 0;
            while (i < a.length() && j < b.length()) {
                char x = a.charAt(i), y = b.charAt(j);
                if (Character.isDigit(x) && Character.isDigit(y)) {
                    int si = i, sj = j;
                    while (i < a.length() && Character.isDigit(a.charAt(i))) i++;
                    while (j < b.length() && Character.isDigit(b.charAt(j))) j++;
                    String n = a.substring(si, i).replaceFirst("^0+(?=.)", "");
                    String m = b.substring(sj, j).replaceFirst("^0+(?=.)", "");
                    int cmp = n.length() != m.length() ? n.length() - m.length() : n.compareTo(m);
                    if (cmp != 0) return cmp;
                } else {
                    int cmp = Character.compare(Character.toLowerCase(x), Character.toLowerCase(y));
                    if (cmp != 0) return cmp;
                    i++;
                    j++;
                }
            }
            return (a.length() - i) - (b.length() - j);
        };
    }

    // ---- 앨범아트 ----

    private void setSource(MediaMetadataRetriever r, Uri uri) throws IOException {
        if (ZipLibrary.ENTRY_SCHEME.equals(uri.getScheme())) {
            r.setDataSource(new BytesSource(ZipLibrary.readHead(getContext(), uri)));
        } else {
            r.setDataSource(getContext(), uri);
        }
    }

    private byte[] embeddedPicture(Uri uri) throws IOException {
        try (MediaMetadataRetriever r = new MediaMetadataRetriever()) {
            setSource(r, uri);
            return r.getEmbeddedPicture();
        }
    }

    @PluginMethod
    public void getArt(PluginCall call) {
        String uri = call.getString("uri");
        new Thread(() -> {
            JSObject result = new JSObject();
            try {
                byte[] art = embeddedPicture(Uri.parse(uri));
                if (art != null) {
                    result.put("dataUrl", toDataUrl(art, 800));
                }
            } catch (Exception ignored) {
                // 앨범아트가 없거나 읽을 수 없으면 기본 이미지를 그대로 둔다.
            }
            call.resolve(result);
        }).start();
    }

    /** 리스트용 작은 앨범아트. 한 번 만든 결과는 앨범아트가 없다는 사실까지 저장해 둔다. */
    @PluginMethod
    public void getThumb(PluginCall call) {
        String uri = call.getString("uri");
        int size = call.getInt("size", THUMB_SIZE);
        thumbs.execute(() -> {
            JSObject result = new JSObject();
            try {
                File dir = new File(getContext().getCacheDir(), "thumbs");
                File cached = new File(dir, Integer.toHexString(uri.hashCode()) + "_" + uri.length() + "_" + size);
                String dataUrl;
                if (cached.exists()) {
                    dataUrl = new String(Files.readAllBytes(cached.toPath()), StandardCharsets.UTF_8);
                } else {
                    byte[] art = null;
                    try {
                        art = embeddedPicture(Uri.parse(uri));
                    } catch (Exception ignored) {
                        // 앨범아트 없음으로 처리한다.
                    }
                    dataUrl = art == null ? "" : toDataUrl(art, size);
                    dir.mkdirs();
                    Files.write(cached.toPath(), dataUrl.getBytes(StandardCharsets.UTF_8));
                }
                if (!dataUrl.isEmpty()) {
                    result.put("dataUrl", dataUrl);
                }
            } catch (Exception ignored) {
                // 저장에 실패해도 음표 아이콘이 나올 뿐이다.
            }
            call.resolve(result);
        });
    }

    // ---- 태그 ----

    private byte[] headOf(Uri uri) throws IOException {
        if (ZipLibrary.ENTRY_SCHEME.equals(uri.getScheme())) {
            return ZipLibrary.readHead(getContext(), uri);
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            return in == null ? new byte[0] : ZipLibrary.readHead(in, Long.MAX_VALUE);
        }
    }

    private static void fill(Map<String, String> tags, MediaMetadataRetriever r, String label, int key) {
        String value = r.extractMetadata(key);
        if (value != null && !value.trim().isEmpty() && !tags.containsKey(label)) {
            tags.put(label, value.trim());
        }
    }

    private static void pair(JSArray out, String label, String value) {
        JSObject item = new JSObject();
        item.put("label", label);
        item.put("value", value);
        out.put(item);
    }

    @PluginMethod
    public void getTags(PluginCall call) {
        String uriText = call.getString("uri");
        new Thread(() -> {
            Uri uri = Uri.parse(uriText);
            Map<String, String> tags = new HashMap<>();
            JSArray tech = new JSArray();
            JSObject result = new JSObject();
            try {
                tags = TagReader.parseId3(headOf(uri));
            } catch (Exception ignored) {
                // 기본 분석기가 읽을 수 있는 만큼 보여 준다.
            }
            try (MediaMetadataRetriever r = new MediaMetadataRetriever()) {
                setSource(r, uri);
                fill(tags, r, "제목", MediaMetadataRetriever.METADATA_KEY_TITLE);
                fill(tags, r, "아티스트", MediaMetadataRetriever.METADATA_KEY_ARTIST);
                fill(tags, r, "앨범", MediaMetadataRetriever.METADATA_KEY_ALBUM);
                fill(tags, r, "앨범 아티스트", MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
                fill(tags, r, "장르", MediaMetadataRetriever.METADATA_KEY_GENRE);
                fill(tags, r, "연도", MediaMetadataRetriever.METADATA_KEY_YEAR);
                fill(tags, r, "트랙", MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER);
                fill(tags, r, "디스크", MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER);
                fill(tags, r, "작곡가", MediaMetadataRetriever.METADATA_KEY_COMPOSER);
                fill(tags, r, "작사가", MediaMetadataRetriever.METADATA_KEY_WRITER);
                String mime = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE);
                if (mime != null) {
                    pair(tech, "형식", mime);
                }
                String bitrate = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE);
                if (bitrate != null) {
                    pair(tech, "비트레이트", Long.parseLong(bitrate) / 1000 + " kbps");
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    String rate = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE);
                    if (rate != null) {
                        pair(tech, "샘플레이트", rate + " Hz");
                    }
                }
            } catch (Exception ignored) {
                // ZIP 안의 일부 형식은 앞부분만으로 분석되지 않는다.
            }
            JSArray list = new JSArray();
            for (String label : TagReader.ORDER) {
                if (tags.containsKey(label)) {
                    pair(list, label, tags.remove(label));
                }
            }
            for (Map.Entry<String, String> extra : tags.entrySet()) {
                pair(list, extra.getKey(), extra.getValue());
            }
            try {
                describeFile(uri, result);
            } catch (Exception ignored) {
                // 경로를 몰라도 태그는 보여 준다.
            }
            result.put("tags", list);
            result.put("tech", tech);
            call.resolve(result);
        }).start();
    }

    private void describeFile(Uri uri, JSObject result) throws Exception {
        String scheme = uri.getScheme();
        if (ZipLibrary.ENTRY_SCHEME.equals(scheme)) {
            String[] info = ZipLibrary.describe(getContext(), uri);
            result.put("path", info[0] + " › " + info[1]);
            try (ZipLibrary.EntryStream entry = ZipLibrary.openEntry(getContext(), uri, 0)) {
                result.put("size", entry.size);
            }
        } else if (DocumentsContract.isDocumentUri(getContext(), uri)) {
            String[] columns = { OpenableColumns.SIZE };
            try (Cursor c = getContext().getContentResolver().query(uri, columns, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    result.put("size", c.getLong(0));
                }
            }
            result.put("path", DocumentsContract.getDocumentId(uri).replaceFirst("^primary:", ""));
        } else if ("file".equals(scheme)) {
            result.put("path", uri.getPath());
            result.put("size", new File(uri.getPath()).length());
        } else {
            String[] columns = { MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.SIZE };
            try (Cursor c = getContext().getContentResolver().query(uri, columns, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    result.put("path", c.getString(0));
                    result.put("size", c.getLong(1));
                }
            }
        }
    }

    // ---- 내보내기 ----

    @PluginMethod
    public void saveText(PluginCall call) {
        String name = call.getString("name", "bookmarks.txt").replaceAll("[\\\\/:*?\"<>|]", "_");
        String text = call.getString("text", "");
        new Thread(() -> {
            try {
                if (BuildConfig.STORE) {
                    saveToDownloads(name, text);
                    call.resolve(new JSObject().put("path", "Download/" + name));
                    return;
                }
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                dir.mkdirs();
                File file = new File(dir, name);
                Files.write(file.toPath(), text.getBytes(StandardCharsets.UTF_8));
                // 파일 앱과 PC 연결에서 바로 보이도록 알린다.
                MediaScannerConnection.scanFile(getContext(), new String[] { file.getPath() }, null, null);
                JSObject result = new JSObject();
                result.put("path", file.getPath());
                call.resolve(result);
            } catch (Exception e) {
                call.reject("파일을 저장하지 못했습니다.");
            }
        }).start();
    }

    /** 저장소 권한 없이 Download 폴더에 쓴다. */
    private void saveToDownloads(String name, String text) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, name.endsWith(".json") ? "application/json" : "text/plain");
        Uri target = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (target == null) {
            throw new IOException("저장 위치를 만들 수 없습니다.");
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(target)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    /** 백업 파일이나 발췌 이미지를 다른 앱으로 보낸다. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = safeName(call.getString("name", "share"));
        String mime = call.getString("mime", "application/octet-stream");
        String base64 = call.getString("data");
        String text = call.getString("text", "");
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "shared");
                ZipLibrary.deleteRecursively(dir);
                dir.mkdirs();
                File file = new File(dir, name);
                Files.write(file.toPath(), base64 != null ? Base64.decode(base64, Base64.DEFAULT) : text.getBytes(StandardCharsets.UTF_8));
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(Intent.createChooser(send, name));
                call.resolve();
            } catch (Exception e) {
                call.reject("공유하지 못했습니다.");
            }
        }).start();
    }

    private static String safeName(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    /** 발췌 이미지를 갤러리에 저장한다. 저장소 권한이 필요 없다. */
    @PluginMethod
    public void saveImage(PluginCall call) {
        String name = safeName(call.getString("name", "image.jpg"));
        String base64 = call.getString("data", "");
        new Thread(() -> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                call.reject("이 안드로이드 버전에서는 저장할 수 없습니다. 공유하기를 이용해 주세요.");
                return;
            }
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DAA");
                Uri target = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (target == null) {
                    throw new IOException("저장 위치를 만들 수 없습니다.");
                }
                try (OutputStream out = getContext().getContentResolver().openOutputStream(target)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("이미지를 저장하지 못했습니다.");
            }
        }).start();
    }

    /** 백업 파일을 사용자가 골라서 읽는다. */
    @PluginMethod
    public void pickText(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "text/plain", "application/json", "application/octet-stream" });
        startActivityForResult(call, intent, "textPicked");
    }

    @ActivityCallback
    private void textPicked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) {
                    throw new IOException();
                }
                byte[] buffer = new byte[MAX_IMPORT_BYTES + 1];
                int size = AudioProbe.readFully(in, buffer, 0, buffer.length);
                if (size > MAX_IMPORT_BYTES) {
                    call.reject("파일이 너무 큽니다.");
                    return;
                }
                call.resolve(new JSObject().put("text", new String(buffer, 0, size, StandardCharsets.UTF_8)));
            } catch (Exception e) {
                call.reject("파일을 읽지 못했습니다.");
            }
        }).start();
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, call.getString("title", ""))
            .putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        getActivity().startActivity(Intent.createChooser(send, call.getString("title", "")));
        call.resolve();
    }

    /** ZIP에서 읽은 곡 앞부분을 앨범아트 분석기에 넘긴다. */
    private static final class BytesSource extends MediaDataSource {
        private final byte[] bytes;

        BytesSource(byte[] bytes) {
            this.bytes = bytes;
        }

        @Override
        public int readAt(long position, byte[] buffer, int offset, int size) {
            if (position >= bytes.length) {
                return -1;
            }
            int count = (int) Math.min(size, bytes.length - position);
            System.arraycopy(bytes, (int) position, buffer, offset, count);
            return count;
        }

        @Override
        public long getSize() {
            return bytes.length;
        }

        @Override
        public void close() {}
    }

    private static String toDataUrl(byte[] art, int maxSize) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(art, 0, art.length, bounds);
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (options.inSampleSize * 2) >= maxSize) {
            options.inSampleSize *= 2;
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(art, 0, art.length, options);
        int longest = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (longest > maxSize * 3 / 2) {
            Bitmap scaled = Bitmap.createScaledBitmap(
                bitmap, bitmap.getWidth() * maxSize / longest, bitmap.getHeight() * maxSize / longest, true
            );
            bitmap.recycle();
            bitmap = scaled;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out);
        bitmap.recycle();
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    // ---- 재생 ----

    @PluginMethod
    public void setQueue(PluginCall call) {
        JSONArray tracks = call.getArray("tracks");
        int index = call.getInt("index", 0);
        long position = call.getDouble("position", 0.0).longValue();
        boolean play = call.getBoolean("play", false);
        String folder = call.getString("folder");
        withController(call, c -> {
            try {
                PlaybackService service = PlaybackService.instance;
                if (service != null) {
                    service.saveNow(); // 목록을 바꾸기 전에 지금 곡의 위치를 남긴다.
                }
                PlaybackService.queueFolder = folder;
                if (folder != null) {
                    new ResumeStore(getContext()).rememberFolder(folder);
                }
                if (sameQueue(c, tracks)) {
                    if (play) {
                        c.seekTo(index, position);
                        recover(c);
                        c.play();
                    }
                    emitState(); // 앱을 다시 열어도 재생 중인 곡을 끊지 않는다.
                    return;
                }
                List<MediaItem> items = new ArrayList<>(tracks.length());
                for (int i = 0; i < tracks.length(); i++) {
                    JSONObject t = tracks.getJSONObject(i);
                    String uri = t.getString("uri");
                    items.add(new MediaItem.Builder()
                        .setMediaId(uri)
                        .setUri(uri)
                        .setMediaMetadata(new MediaMetadata.Builder().setTitle(t.getString("title")).build())
                        .build());
                }
                c.setMediaItems(items, index, position);
                c.prepare();
                c.setPlayWhenReady(play);
            } catch (JSONException e) {
                throw new IllegalArgumentException(e);
            }
        });
    }

    private static boolean sameQueue(MediaController c, JSONArray tracks) throws JSONException {
        if (c.getMediaItemCount() != tracks.length() || tracks.length() == 0) {
            return false;
        }
        for (int i = 0; i < tracks.length(); i++) {
            if (!c.getMediaItemAt(i).mediaId.equals(tracks.getJSONObject(i).getString("uri"))) {
                return false;
            }
        }
        return true;
    }

    /** 재생 오류가 나면 플레이어가 멈춘 상태로 남으므로, 다음 조작 때 다시 준비시킨다. */
    private static void recover(MediaController c) {
        if (c.getPlaybackState() == Player.STATE_IDLE) {
            c.prepare();
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, c -> {
            if (c.getPlaybackState() == Player.STATE_ENDED) {
                c.seekTo(c.getCurrentMediaItemIndex(), 0);
            }
            recover(c);
            c.play();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, Player::pause);
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        long position = call.getDouble("position", 0.0).longValue();
        withController(call, c -> {
            c.seekTo(position);
            recover(c);
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        float speed = call.getFloat("speed", 1f);
        withController(call, c -> {
            PlaybackService.requestedSpeed = speed;
            c.setPlaybackSpeed(speed);
            emitState();
        });
    }

    /** 폴더의 마지막 곡과 곡별 들은 위치를 돌려준다. */
    @PluginMethod
    public void getResume(PluginCall call) {
        ResumeStore store = new ResumeStore(getContext());
        String folder = call.getString("folder", "");
        JSONArray uris = call.getArray("uris");
        JSObject positions = new JSObject();
        for (int i = 0; uris != null && i < uris.length(); i++) {
            String uri = uris.optString(i);
            long position = store.position(uri);
            if (position > 0) {
                positions.put(uri, position);
            }
        }
        JSObject result = new JSObject();
        result.put("positions", positions);
        String last = store.lastUri(folder);
        if (last != null) {
            result.put("uri", last);
        }
        String lastFolder = store.lastFolder();
        if (lastFolder != null) {
            result.put("lastFolder", lastFolder);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setSleep(PluginCall call) {
        long delay = call.getDouble("delay", 0.0).longValue();
        boolean endOfTrack = call.getBoolean("endOfTrack", false);
        withController(call, c -> {
            PlaybackService service = PlaybackService.instance;
            if (service != null) {
                service.setSleep(delay, endOfTrack);
            }
            emitState();
        });
    }

    @PluginMethod
    public void setEq(PluginCall call) {
        JSONArray values = call.getArray("gains");
        float[] gains = new float[values == null ? 0 : values.length()];
        for (int i = 0; i < gains.length; i++) {
            gains[i] = (float) values.optDouble(i, 0);
        }
        EqProcessor.configure(call.getBoolean("enabled", false), gains);
        call.resolve();
    }

    @PluginMethod
    public void skipTo(PluginCall call) {
        int index = call.getInt("index", 0);
        long position = call.getDouble("position", 0.0).longValue();
        withController(call, c -> {
            c.seekTo(index, position);
            recover(c);
        });
    }
}
