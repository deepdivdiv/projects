package com.snet.musicapk;

import android.content.Context;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.BufferedInputStream;
import java.io.Closeable;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ZIP을 풀지 않고 폴더처럼 다룬다. 목차와 각 곡의 앞부분만 읽어서 금방 열리고,
 * 곡은 ZipDataSource가 ZIP에서 바로 읽으므로 저장 공간도 더 쓰지 않는다.
 * 앱 내부에는 목록(meta.json)만 남겨 다음에는 ZIP을 읽지 않고 연다.
 * 같은 ZIP은 같은 id와 파일명을 가지므로 북마크가 이어진다.
 */
final class ZipLibrary {

    static final String PATH_PREFIX = "zip:";
    static final String ENTRY_SCHEME = "zipentry";
    private static final String META = "meta.json";
    private static final int MAX_HEAD = 16 * 1024 * 1024;

    private static final Set<String> PLAYABLE = new HashSet<>(Arrays.asList(
        "mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "m4b", "aac", "amr", "awb", "3ga", "mka", "weba"
    ));
    private static final Set<String> UNPLAYABLE = new HashSet<>(Arrays.asList(
        "wma", "ape", "aif", "aiff", "aifc", "alac", "dsf", "dff", "mid", "midi", "wv", "tta", "mpc", "ra", "rm", "m4p"
    ));

    private ZipLibrary() {}

    private static File root(Context context) {
        return new File(context.getFilesDir(), "zips");
    }

    static final class Entry {
        String source;
        String file;
        String title;
        int index;
        long duration;
    }

    /** ZIP 안 한 곡을 읽는 스트림. 닫으면 ZIP도 닫힌다. */
    static final class EntryStream implements Closeable {
        final InputStream in;
        final long size;
        private final ZipFile zip;

        EntryStream(ZipFile zip, InputStream in, long size) {
            this.zip = zip;
            this.in = in;
            this.size = size;
        }

        @Override
        public void close() throws IOException {
            zip.close();
        }
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 재생할 수 있는 음원. */
    static boolean isAudio(String name) {
        return PLAYABLE.contains(extension(name));
    }

    /** 음원이지만 재생 엔진에 해석기가 없어서 목록에만 표시한다. */
    static boolean isUnplayableAudio(String name) {
        return UNPLAYABLE.contains(extension(name));
    }

    static boolean isZip(String name) {
        return name.toLowerCase(Locale.ROOT).endsWith(".zip");
    }

    static String stripExtension(String name) {
        return isAudio(name) || isUnplayableAudio(name) ? name.substring(0, name.lastIndexOf('.')) : name;
    }

    private static String id(File zip) {
        return hash(zip.getName() + "/" + zip.length());
    }

    /** 처음 열 때만 목록을 만들고, 그 뒤로는 저장해 둔 목록으로 바로 연다. */
    static JSObject open(Context context, File zip, Runnable onSlowOpen) throws IOException, JSONException {
        String id = id(zip);
        File dir = new File(root(context), id);
        File metaFile = new File(dir, META);
        if (metaFile.exists()) {
            JSONObject meta = readMeta(metaFile);
            if (isIndexed(meta)) {
                if (!zip.getPath().equals(meta.optString("source"))) {
                    meta.put("source", zip.getPath()); // 파일을 옮겨도 계속 재생되게 한다.
                    Files.write(metaFile.toPath(), meta.toString().getBytes(StandardCharsets.UTF_8));
                }
                return load(context, PATH_PREFIX + id);
            }
        }
        onSlowOpen.run();
        List<Entry> entries;
        try {
            entries = scan(zip);
        } catch (ZipException e) {
            throw new IOException("암호가 걸렸거나 손상된 ZIP은 열 수 없습니다.");
        }
        if (entries.isEmpty()) {
            throw new IOException("ZIP 안에 재생할 수 있는 파일이 없습니다.");
        }
        JSONArray tracks = new JSONArray();
        for (Entry e : entries) {
            tracks.put(new JSONObject()
                .put("file", e.file)
                .put("title", e.title)
                .put("index", e.index)
                .put("duration", e.duration));
        }
        JSONObject meta = new JSONObject()
            .put("name", zip.getName().replaceFirst("(?i)\\.zip$", ""))
            .put("source", zip.getPath())
            .put("tracks", tracks);
        deleteRecursively(dir); // 예전 버전이 풀어 둔 사본이 있으면 공간을 돌려준다.
        if (!dir.mkdirs()) {
            throw new IOException("저장 공간을 만들 수 없습니다.");
        }
        Files.write(metaFile.toPath(), meta.toString().getBytes(StandardCharsets.UTF_8));
        return load(context, PATH_PREFIX + id);
    }

    private static boolean isIndexed(JSONObject meta) throws JSONException {
        JSONArray tracks = meta.getJSONArray("tracks");
        return tracks.length() > 0 && tracks.getJSONObject(0).has("index");
    }

    private static JSONObject readMeta(File metaFile) throws IOException, JSONException {
        return new JSONObject(new String(Files.readAllBytes(metaFile.toPath()), StandardCharsets.UTF_8));
    }

    /** 이름 바이트를 보존해 두었다가 decodeName에서 UTF-8/CP949를 판별한다. */
    private static ZipFile openZip(File zip) throws IOException {
        return new ZipFile(zip, StandardCharsets.ISO_8859_1);
    }

    /** 재생할 곡을 정렬해서 돌려준다. file은 ZIP 안 순번이라 같은 ZIP이면 항상 같다. */
    static List<Entry> scan(File zipFile) throws IOException {
        List<Entry> entries = new ArrayList<>();
        try (ZipFile zip = openZip(zipFile)) {
            Enumeration<? extends ZipEntry> all = zip.entries();
            for (int index = 0; all.hasMoreElements(); index++) {
                ZipEntry entry = all.nextElement();
                String source = decodeName(entry.getName()).replace('\\', '/');
                if (entry.isDirectory() || source.startsWith("__MACOSX/") || !isAudio(source)) {
                    continue;
                }
                String base = source.substring(source.lastIndexOf('/') + 1);
                if (base.startsWith("._")) {
                    continue;
                }
                // 항목 이름을 경로로 쓰지 않으므로 ../ 같은 이름이 앱 폴더 밖으로 나갈 수 없다.
                String extension = base.substring(base.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
                Entry e = new Entry();
                e.source = source;
                e.file = String.format(Locale.ROOT, "%05d.%s", entries.size(), extension);
                e.title = stripExtension(base);
                e.index = index;
                try (InputStream in = zip.getInputStream(entry)) {
                    e.duration = AudioProbe.durationMs(in, entry.getSize(), base);
                }
                entries.add(e);
            }
        }
        Comparator<String> order = MusicPlayerPlugin.naturalOrder();
        entries.sort((a, b) -> order.compare(a.source, b.source));
        return entries;
    }

    /** ZIP 안 index번째 항목을 position부터 읽는다. */
    static EntryStream openEntry(File zipFile, int index, long position) throws IOException {
        ZipFile zip = openZip(zipFile);
        try {
            Enumeration<? extends ZipEntry> all = zip.entries();
            for (int i = 0; all.hasMoreElements(); i++) {
                ZipEntry entry = all.nextElement();
                if (i == index) {
                    InputStream in = zip.getInputStream(entry);
                    AudioProbe.skipFully(in, position);
                    return new EntryStream(zip, in, entry.getSize());
                }
            }
            throw new IOException("ZIP 안에서 파일을 찾을 수 없습니다.");
        } catch (IOException | RuntimeException e) {
            zip.close();
            throw e;
        }
    }

    /** zipentry://id/파일명 주소를 실제 ZIP 항목으로 찾아 연다. */
    static EntryStream openEntry(Context context, Uri uri, long position) throws IOException {
        try {
            File dir = dirFor(context, PATH_PREFIX + uri.getHost());
            if (dir == null) {
                throw new IOException("잘못된 ZIP 주소입니다.");
            }
            JSONObject meta = readMeta(new File(dir, META));
            JSONArray tracks = meta.getJSONArray("tracks");
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject t = tracks.getJSONObject(i);
                if (t.getString("file").equals(uri.getLastPathSegment())) {
                    return openEntry(new File(meta.getString("source")), t.getInt("index"), position);
                }
            }
            throw new IOException("ZIP 안에서 파일을 찾을 수 없습니다.");
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    /** 태그와 앨범아트가 들어 있는 곡 앞부분을 읽는다. */
    static byte[] readHead(Context context, Uri uri) throws IOException {
        try (EntryStream entry = openEntry(context, uri, 0)) {
            return readHead(entry.in, entry.size);
        }
    }

    static byte[] readHead(InputStream in, long total) throws IOException {
        byte[] head = new byte[10];
        int got = AudioProbe.readFully(in, head, 0, 10);
        long tag = 0;
        if (got == 10 && head[0] == 'I' && head[1] == 'D' && head[2] == '3') {
            tag = ((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | ((head[8] & 0x7F) << 7) | (head[9] & 0x7F);
        }
        // ID3가 없는 형식(FLAC 등)은 앨범아트 위치를 모르므로 앞부분을 넉넉히 읽는다.
        long wanted = tag > 0 ? tag + 10 + 64 * 1024 : 4 * 1024 * 1024;
        int size = (int) Math.min(Math.min(total, wanted), MAX_HEAD);
        byte[] out = new byte[size];
        System.arraycopy(head, 0, out, 0, Math.min(got, size));
        int read = got >= size ? 0 : AudioProbe.readFully(in, out, got, size - got);
        return read + got == size ? out : Arrays.copyOf(out, read + got);
    }

    /** zipentry 주소의 곡이 들어 있는 ZIP 경로와 곡 제목. */
    static String[] describe(Context context, Uri uri) throws IOException, JSONException {
        File dir = dirFor(context, PATH_PREFIX + uri.getHost());
        if (dir == null) {
            throw new IOException("잘못된 ZIP 주소입니다.");
        }
        JSONObject meta = readMeta(new File(dir, META));
        JSONArray tracks = meta.getJSONArray("tracks");
        for (int i = 0; i < tracks.length(); i++) {
            JSONObject t = tracks.getJSONObject(i);
            if (t.getString("file").equals(uri.getLastPathSegment())) {
                return new String[] { meta.getString("source"), t.getString("title") };
            }
        }
        throw new IOException("ZIP 안에서 파일을 찾을 수 없습니다.");
    }

    /** 윈도우에서 만든 ZIP은 파일명이 CP949인 경우가 많다. */
    static String decodeName(String name) {
        for (int i = 0; i < name.length(); i++) {
            if (name.charAt(i) > 0xFF) {
                return name; // ZIP이 UTF-8로 표시해 둔 이름은 이미 올바르게 풀려 있다.
            }
        }
        byte[] bytes = name.getBytes(StandardCharsets.ISO_8859_1);
        try {
            return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
        } catch (CharacterCodingException notUtf8) {
            return new String(bytes, koreanCharset());
        }
    }

    private static Charset koreanCharset() {
        for (String candidate : new String[] { "windows-949", "MS949", "x-windows-949", "EUC-KR" }) {
            if (Charset.isSupported(candidate)) {
                return Charset.forName(candidate);
            }
        }
        return StandardCharsets.UTF_8;
    }

    /** 앞부분으로 먼저 계산하고, 안 되는 파일만 느린 전체 분석을 한다. */
    static long readDuration(File file) {
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            long duration = AudioProbe.durationMs(in, file.length(), file.getName());
            if (duration > 0) {
                return duration;
            }
        } catch (IOException ignored) {
            // 아래의 전체 분석으로 넘어간다.
        }
        try (MediaMetadataRetriever r = new MediaMetadataRetriever()) {
            r.setDataSource(file.getPath());
            String value = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return value == null ? 0 : Long.parseLong(value);
        } catch (Exception e) {
            return 0; // 재생이 시작되면 플레이어가 실제 길이를 알려준다.
        }
    }

    /** 저장해 둔 목록을 폴더 형태로 읽는다. 예전 버전이 풀어 둔 곡은 파일 주소로 재생한다. */
    static JSObject load(Context context, String path) throws IOException, JSONException {
        File dir = dirFor(context, path);
        if (dir == null || !new File(dir, META).exists()) {
            throw new IOException("ZIP을 찾을 수 없습니다.");
        }
        JSONObject meta = readMeta(new File(dir, META));
        JSONArray source = meta.getJSONArray("tracks");
        JSArray tracks = new JSArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject t = source.getJSONObject(i);
            JSObject track = new JSObject();
            track.put("uri", t.has("index")
                ? ENTRY_SCHEME + "://" + dir.getName() + "/" + t.getString("file")
                : Uri.fromFile(new File(dir, t.getString("file"))).toString());
            track.put("title", t.getString("title"));
            track.put("duration", t.getLong("duration"));
            tracks.put(track);
        }
        JSObject folder = new JSObject();
        folder.put("path", path);
        folder.put("name", meta.getString("name"));
        folder.put("tracks", tracks);
        if (meta.has("source")) {
            folder.put("source", meta.getString("source"));
        }
        return folder;
    }

    /** path는 화면에서 넘어오는 값이므로 zips 바로 아래 폴더만 가리키게 한다. */
    static File dirFor(Context context, String path) {
        if (path == null || !path.startsWith(PATH_PREFIX)) {
            return null;
        }
        String id = path.substring(PATH_PREFIX.length());
        return id.matches("[0-9a-f]+") ? new File(root(context), id) : null;
    }

    static void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                out.append(String.format(Locale.ROOT, "%02x", digest[i]));
            }
            return out.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
