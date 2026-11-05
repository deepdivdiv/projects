package com.snet.musicapk;

import android.content.Context;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONException;

/**
 * 스토어 버전의 탐색기. 저장소 전체 대신 사용자가 연결한 폴더만 읽는다.
 * 화면에 넘기는 경로는 문서 주소이고, ZIP은 앞에 zipfile:을 붙여 폴더와 구분한다.
 */
final class TreeBrowser {

    static final String ZIP_PREFIX = "zipfile:";
    private static final int SLOW_COUNT = 20;
    private static final String[] COLUMNS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE
    };
    private static Properties durations;

    private TreeBrowser() {}

    static List<Uri> roots(Context context) {
        List<Uri> roots = new ArrayList<>();
        for (UriPermission p : context.getContentResolver().getPersistedUriPermissions()) {
            if (p.isReadPermission() && DocumentsContract.isTreeUri(p.getUri())) {
                roots.add(p.getUri());
            }
        }
        return roots;
    }

    /** primary:Music/강의 -> 강의, primary:Music -> Music, primary: -> primary */
    static String nameOf(String documentId) {
        int cut = Math.max(documentId.lastIndexOf('/'), documentId.lastIndexOf(':'));
        String name = documentId.substring(cut + 1);
        return name.isEmpty() ? documentId.replace(":", "") : name;
    }

    /** 연결한 폴더부터 현재 폴더까지의 문서 id. 형식을 모르는 저장소는 양 끝만 돌려준다. */
    static List<String> chain(String treeId, String documentId) {
        List<String> ids = new ArrayList<>();
        ids.add(treeId);
        if (documentId.equals(treeId)) {
            return ids;
        }
        String base = treeId.endsWith(":") || treeId.endsWith("/") ? treeId : treeId + "/";
        if (!documentId.startsWith(base)) {
            ids.add(documentId);
            return ids;
        }
        String current = treeId;
        for (String part : documentId.substring(base.length()).split("/")) {
            current = current.endsWith(":") || current.endsWith("/") ? current + part : current + "/" + part;
            ids.add(current);
        }
        return ids;
    }

    /** 한 단계 위의 문서 id. 연결한 폴더가 맨 위라면 null이다. */
    static String parentId(String treeId, String documentId) {
        List<String> ids = chain(treeId, documentId);
        return ids.size() < 2 ? null : ids.get(ids.size() - 2);
    }

    private static String treeId(Uri uri) {
        return DocumentsContract.getTreeDocumentId(uri);
    }

    private static String documentId(Uri uri) {
        return DocumentsContract.isDocumentUri(null, uri) ? DocumentsContract.getDocumentId(uri) : treeId(uri);
    }

    private static Uri document(Uri tree, String id) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, id);
    }

    /** 연결한 폴더 맨 위에서는 연결 목록("")으로 돌아간다. */
    static String parent(String path) {
        Uri uri = Uri.parse(path);
        String parent = parentId(treeId(uri), documentId(uri));
        return parent == null ? "" : document(uri, parent).toString();
    }

    static List<String[]> crumbs(String path) {
        Uri uri = Uri.parse(path);
        List<String[]> out = new ArrayList<>();
        out.add(new String[] { "내 폴더", "" });
        for (String id : chain(treeId(uri), documentId(uri))) {
            out.add(new String[] { nameOf(id), document(uri, id).toString() });
        }
        return out;
    }

    static JSObject list(Context context, String path, Runnable onSlow) throws IOException, JSONException {
        if (path == null || path.isEmpty()) {
            return listRoots(context);
        }
        if (path.startsWith(ZipLibrary.PATH_PREFIX)) {
            return listZip(ZipLibrary.load(context, path));
        }
        if (path.startsWith(ZIP_PREFIX)) {
            Uri uri = Uri.parse(path.substring(ZIP_PREFIX.length()));
            return listZip(ZipLibrary.open(context, source(context, uri), onSlow));
        }
        return listDir(context, Uri.parse(path), onSlow);
    }

    private static ZipLibrary.Source source(Context context, Uri uri) throws IOException {
        String[] columns = { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        try (Cursor c = context.getContentResolver().query(uri, columns, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                return new ZipLibrary.Source(c.getString(0), c.getLong(1), uri.toString());
            }
        }
        throw new IOException("ZIP 파일을 찾을 수 없습니다. 폴더를 다시 연결해 주세요.");
    }

    private static JSObject listZip(JSObject zip) throws JSONException {
        String source = zip.getString("source");
        boolean known = source != null && source.startsWith("content:");
        String parent = known ? parent(source) : null;
        List<String[]> crumbs = parent == null || parent.isEmpty() ? new ArrayList<>() : crumbs(parent);
        return FileBrowser.zipListing(zip, parent, crumbs);
    }

    private static JSObject listRoots(Context context) throws JSONException {
        JSArray dirs = new JSArray();
        for (Uri root : roots(context)) {
            JSObject dir = new JSObject();
            dir.put("name", nameOf(treeId(root)));
            dir.put("path", document(root, treeId(root)).toString());
            dir.put("tree", root.toString());
            dir.put("count", 0);
            dirs.put(dir);
        }
        JSObject out = FileBrowser.empty("", "내 폴더");
        out.put("isRoot", true);
        out.put("crumbs", FileBrowser.crumbsJson(java.util.Collections.singletonList(new String[] { "내 폴더", "" })));
        out.put("dirs", dirs);
        return out;
    }

    private static final class Child {
        String id;
        String name;
        String mime;
        long size;
    }

    private static JSObject listDir(Context context, Uri uri, Runnable onSlow) throws IOException, JSONException {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(uri, documentId(uri));
        List<Child> items = new ArrayList<>();
        try (Cursor c = context.getContentResolver().query(children, COLUMNS, null, null, null)) {
            if (c == null) {
                throw new IOException("폴더를 찾을 수 없습니다. 다시 연결해 주세요.");
            }
            while (c.moveToNext()) {
                Child child = new Child();
                child.id = c.getString(0);
                child.name = c.getString(1);
                child.mime = c.getString(2);
                child.size = c.getLong(3);
                if (child.name != null && !child.name.startsWith(".")) {
                    items.add(child);
                }
            }
        } catch (SecurityException e) {
            throw new IOException("폴더 연결이 끊겼습니다. 다시 연결해 주세요.");
        }
        Comparator<String> order = MusicPlayerPlugin.naturalOrder();
        items.sort((a, b) -> order.compare(a.name, b.name));

        JSArray dirs = new JSArray(), zips = new JSArray(), eggs = new JSArray(), unplayable = new JSArray();
        List<Child> audio = new ArrayList<>();
        for (Child child : items) {
            String link = document(uri, child.id).toString();
            if (DocumentsContract.Document.MIME_TYPE_DIR.equals(child.mime)) {
                JSObject item = new JSObject();
                item.put("name", child.name);
                item.put("path", link);
                item.put("count", 0);
                dirs.put(item);
            } else if (ZipLibrary.isZip(child.name)) {
                JSObject item = new JSObject();
                item.put("name", child.name);
                item.put("path", ZIP_PREFIX + link);
                item.put("size", child.size);
                zips.put(item);
            } else if (child.name.toLowerCase(Locale.ROOT).endsWith(".egg")) {
                JSObject item = new JSObject();
                item.put("name", child.name);
                item.put("size", child.size);
                eggs.put(item);
            } else if (ZipLibrary.isAudio(child.name)) {
                audio.add(child);
            } else if (ZipLibrary.isUnplayableAudio(child.name)) {
                JSObject item = new JSObject();
                item.put("name", child.name);
                item.put("size", child.size);
                unplayable.put(item);
            }
        }

        String path = uri.toString();
        List<String[]> crumbs = crumbs(path);
        JSObject out = FileBrowser.empty(path, crumbs.get(crumbs.size() - 1)[0]);
        out.put("crumbs", FileBrowser.crumbsJson(crumbs));
        out.put("parent", parent(path));
        out.put("dirs", dirs);
        out.put("zips", zips);
        out.put("eggs", eggs);
        out.put("unplayable", unplayable);
        out.put("tracks", tracks(context, uri, audio, onSlow));
        return out;
    }

    private static JSArray tracks(Context context, Uri tree, List<Child> audio, Runnable onSlow) {
        Properties cache = durations(context);
        long[] lengths = new long[audio.size()];
        List<Integer> missing = new ArrayList<>();
        for (int i = 0; i < audio.size(); i++) {
            Child c = audio.get(i);
            String known = cache.getProperty(c.id + "|" + c.size);
            if (known != null) {
                lengths[i] = Long.parseLong(known);
            } else {
                missing.add(i);
            }
        }
        if (missing.size() >= SLOW_COUNT) {
            onSlow.run();
        }
        if (!missing.isEmpty()) {
            // 곡 앞부분만 읽지만 곡이 많으면 시간이 걸려서 나눠서 읽고, 결과는 저장해 둔다.
            ExecutorService pool = Executors.newFixedThreadPool(4);
            List<Future<Long>> jobs = new ArrayList<>();
            for (int i : missing) {
                Child c = audio.get(i);
                jobs.add(pool.submit(() -> probe(context, document(tree, c.id), c)));
            }
            for (int k = 0; k < jobs.size(); k++) {
                int i = missing.get(k);
                Child c = audio.get(i);
                try {
                    lengths[i] = jobs.get(k).get();
                    if (lengths[i] > 0) {
                        cache.setProperty(c.id + "|" + c.size, Long.toString(lengths[i]));
                    }
                } catch (Exception ignored) {
                    lengths[i] = 0; // 재생이 시작되면 플레이어가 실제 길이를 알려준다.
                }
            }
            pool.shutdown();
            saveDurations(context, cache);
        }
        JSArray out = new JSArray();
        for (int i = 0; i < audio.size(); i++) {
            Child c = audio.get(i);
            JSObject item = new JSObject();
            item.put("uri", document(tree, c.id).toString());
            item.put("title", ZipLibrary.stripExtension(c.name));
            item.put("duration", lengths[i]);
            out.put(item);
        }
        return out;
    }

    private static long probe(Context context, Uri uri, Child c) throws IOException {
        try (InputStream raw = context.getContentResolver().openInputStream(uri)) {
            return raw == null ? 0 : AudioProbe.durationMs(new BufferedInputStream(raw), c.size, c.name);
        }
    }

    private static File durationFile(Context context) {
        return new File(context.getFilesDir(), "durations.properties");
    }

    private static synchronized Properties durations(Context context) {
        if (durations == null) {
            durations = new Properties();
            try (InputStream in = new FileInputStream(durationFile(context))) {
                durations.load(in);
            } catch (IOException ignored) {
                // 처음 실행이면 파일이 없다.
            }
        }
        return durations;
    }

    private static synchronized void saveDurations(Context context, Properties cache) {
        try (FileOutputStream out = new FileOutputStream(durationFile(context))) {
            cache.store(out, null);
        } catch (IOException ignored) {
            // 저장하지 못하면 다음에 다시 계산한다.
        }
    }

}
