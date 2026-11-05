package com.snet.musicapk;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONException;

/** 저장소를 탐색기처럼 읽는다. ZIP은 폴더처럼 들어갈 수 있게 같은 형태로 돌려준다. */
final class FileBrowser {

    private FileBrowser() {}

    /** {이름, 경로}. 첫 번째가 내장 메모리다. */
    static List<String[]> roots(Context context) {
        List<String[]> roots = new ArrayList<>();
        for (File dir : context.getExternalFilesDirs(null)) {
            if (dir == null) {
                continue; // 분리된 SD 카드
            }
            String path = dir.getPath();
            int cut = path.indexOf("/Android/");
            if (cut > 0) {
                roots.add(new String[] { roots.isEmpty() ? "내장 메모리" : "SD 카드", path.substring(0, cut) });
            }
        }
        return roots;
    }

    /** 경로를 화면의 경로 표시용 조각으로 나눈다. 저장소가 여러 개면 맨 앞에 '저장소'가 붙는다. */
    static List<String[]> crumbs(List<String[]> roots, String path) {
        List<String[]> out = new ArrayList<>();
        if (roots.size() > 1) {
            out.add(new String[] { "저장소", "" });
        }
        for (String[] root : roots) {
            if (path.equals(root[1]) || path.startsWith(root[1] + "/")) {
                out.add(root);
                String current = root[1];
                for (String part : path.substring(root[1].length()).split("/")) {
                    if (!part.isEmpty()) {
                        current += "/" + part;
                        out.add(new String[] { part, current });
                    }
                }
                break;
            }
        }
        return out;
    }

    /** 맨 위 저장소에서는 null이다. */
    static String parentOf(List<String[]> roots, String path) {
        for (String[] root : roots) {
            if (path.equals(root[1])) {
                return roots.size() > 1 ? "" : null;
            }
        }
        int slash = path.lastIndexOf('/');
        return slash > 0 ? path.substring(0, slash) : null;
    }

    static JSArray crumbsJson(List<String[]> crumbs) throws JSONException {
        JSArray out = new JSArray();
        for (String[] c : crumbs) {
            JSObject item = new JSObject();
            item.put("name", c[0]);
            item.put("path", c[1]);
            out.put(item);
        }
        return out;
    }

    static JSObject list(Context context, String path, Runnable onExtract) throws IOException, JSONException {
        if (BuildConfig.STORE) {
            return TreeBrowser.list(context, path, onExtract);
        }
        List<String[]> roots = roots(context);
        if (roots.isEmpty()) {
            throw new IOException("저장소를 찾을 수 없습니다.");
        }
        if (path == null || path.isEmpty()) {
            return roots.size() > 1 ? listRoots(roots) : listDir(context, roots, roots.get(0)[1]);
        }
        if (path.startsWith(ZipLibrary.PATH_PREFIX)) {
            return listZip(context, roots, ZipLibrary.load(context, path));
        }
        File file = new File(path);
        if (file.isFile() && ZipLibrary.isZip(file.getName())) {
            return listZip(context, roots, ZipLibrary.open(context, ZipLibrary.Source.of(file), onExtract));
        }
        if (!file.isDirectory()) {
            throw new IOException("폴더를 찾을 수 없습니다.");
        }
        return listDir(context, roots, path);
    }

    private static JSObject listRoots(List<String[]> roots) throws JSONException {
        JSArray dirs = new JSArray();
        for (String[] root : roots) {
            JSObject dir = new JSObject();
            dir.put("name", root[0]);
            dir.put("path", root[1]);
            dir.put("count", 0);
            dirs.put(dir);
        }
        JSObject out = empty("", "저장소");
        out.put("crumbs", crumbsJson(crumbs(roots, "")));
        out.put("dirs", dirs);
        return out;
    }

    static JSObject empty(String path, String name) {
        JSObject out = new JSObject();
        out.put("path", path);
        out.put("name", name);
        out.put("dirs", new JSArray());
        out.put("zips", new JSArray());
        out.put("eggs", new JSArray());
        out.put("unplayable", new JSArray());
        out.put("tracks", new JSArray());
        return out;
    }

    /** ZIP 내용에 경로 정보를 더해 일반 폴더와 같은 모양으로 만든다. */
    private static JSObject listZip(Context context, List<String[]> roots, JSObject zip) throws JSONException {
        String source = zip.getString("source");
        String parent = source == null ? null : new File(source).getParent();
        return zipListing(zip, parent, parent == null ? new ArrayList<>() : crumbs(roots, parent));
    }

    static JSObject zipListing(JSObject zip, String parent, List<String[]> crumbs) throws JSONException {
        crumbs.add(new String[] { zip.getString("name"), zip.getString("path") });
        JSObject out = empty(zip.getString("path"), zip.getString("name"));
        out.put("zip", true);
        out.put("tracks", zip.getJSONArray("tracks"));
        out.put("crumbs", crumbsJson(crumbs));
        if (parent != null) {
            out.put("parent", parent);
        }
        return out;
    }

    private static JSObject listDir(Context context, List<String[]> roots, String path) throws JSONException {
        File dir = new File(path);
        File[] children = dir.listFiles();
        if (children == null) {
            children = new File[0];
        }
        Comparator<String> order = MusicPlayerPlugin.naturalOrder();
        Arrays.sort(children, (a, b) -> order.compare(a.getName(), b.getName()));

        Map<String, long[]> indexed = mediaStoreEntries(context, path);
        JSArray dirs = new JSArray(), zips = new JSArray(), eggs = new JSArray(), tracks = new JSArray(), unplayable = new JSArray();
        for (File child : children) {
            String name = child.getName();
            if (name.startsWith(".")) {
                continue;
            }
            if (child.isDirectory()) {
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("path", child.getPath());
                item.put("count", countPlayable(child));
                dirs.put(item);
            } else if (ZipLibrary.isZip(name)) {
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("path", child.getPath());
                item.put("size", child.length());
                zips.put(item);
            } else if (name.toLowerCase(Locale.ROOT).endsWith(".egg")) {
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("size", child.length());
                eggs.put(item);
            } else if (ZipLibrary.isAudio(name)) {
                tracks.put(track(child, indexed.get(name)));
            } else if (ZipLibrary.isUnplayableAudio(name)) {
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("size", child.length());
                unplayable.put(item);
            }
        }

        List<String[]> crumbs = crumbs(roots, path);
        JSObject out = empty(path, crumbs.isEmpty() ? dir.getName() : crumbs.get(crumbs.size() - 1)[0]);
        out.put("crumbs", crumbsJson(crumbs));
        out.put("dirs", dirs);
        out.put("zips", zips);
        out.put("eggs", eggs);
        out.put("tracks", tracks);
        out.put("unplayable", unplayable);
        String parent = parentOf(roots, path);
        if (parent != null) {
            out.put("parent", parent);
        }
        return out;
    }

    private static int countPlayable(File dir) {
        String[] names = dir.list();
        int count = 0;
        if (names != null) {
            for (String name : names) {
                if (ZipLibrary.isAudio(name) || ZipLibrary.isZip(name)) {
                    count++;
                }
            }
        }
        return count;
    }

    /** 미디어 저장소에 있으면 그 URI를 써서 이전에 저장한 북마크와 이어듣기가 유지된다. */
    private static JSObject track(File file, long[] entry) {
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        long duration = entry != null ? entry[1] : 0;
        JSObject item = new JSObject();
        item.put("uri", (entry != null ? ContentUris.withAppendedId(collection, entry[0]) : Uri.fromFile(file)).toString());
        item.put("title", ZipLibrary.stripExtension(file.getName()));
        item.put("duration", duration > 0 ? duration : ZipLibrary.readDuration(file));
        return item;
    }

    /** 파일명 -> {id, 길이}. 바로 아래 파일만 남긴다. */
    private static Map<String, long[]> mediaStoreEntries(Context context, String path) {
        Map<String, long[]> out = new HashMap<>();
        String[] columns = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA
        };
        String selection = MediaStore.Audio.Media.DATA + " LIKE ?";
        try (Cursor c = context.getContentResolver().query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, columns, selection, new String[] { path + "/%" }, null
        )) {
            if (c != null) {
                while (c.moveToNext()) {
                    String data = c.getString(2);
                    if (data != null && path.equals(new File(data).getParent())) {
                        out.put(new File(data).getName(), new long[] { c.getLong(0), c.getLong(1) });
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // 미디어 저장소를 못 읽어도 파일을 직접 읽어 재생할 수 있다.
        }
        return out;
    }
}
