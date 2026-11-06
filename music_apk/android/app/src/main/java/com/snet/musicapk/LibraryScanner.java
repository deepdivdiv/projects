package com.snet.musicapk;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** 폰의 음원 전체를 태그와 함께 읽는다. 앨범, 아티스트, 장르 화면이 이 목록으로 만들어진다. */
final class LibraryScanner {

    private LibraryScanner() {}

    private static String text(Cursor c, String column) {
        int index = c.getColumnIndex(column);
        String value = index < 0 ? null : c.getString(index);
        return value == null || value.equals("<unknown>") ? "" : value.trim();
    }

    private static long number(Cursor c, String column) {
        int index = c.getColumnIndex(column);
        return index < 0 ? 0 : c.getLong(index);
    }

    static JSArray scan(Context context) {
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        List<String> columns = new ArrayList<>(List.of(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.DATE_ADDED
        ));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            columns.add(MediaStore.Audio.Media.ALBUM_ARTIST);
            columns.add(MediaStore.Audio.Media.GENRE);
        }
        // 벨소리, 알림음처럼 음악이 아닌 시스템 소리는 뺀다.
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            selection += " OR " + MediaStore.Audio.Media.IS_AUDIOBOOK + " != 0";
        }
        JSArray out = new JSArray();
        try (Cursor c = context.getContentResolver().query(collection, columns.toArray(new String[0]), selection, null, null)) {
            if (c == null) {
                return out;
            }
            while (c.moveToNext()) {
                String name = text(c, MediaStore.Audio.Media.DISPLAY_NAME);
                if (!ZipLibrary.isAudio(name)) {
                    continue;
                }
                String data = text(c, MediaStore.Audio.Media.DATA);
                JSObject t = new JSObject();
                t.put("uri", ContentUris.withAppendedId(collection, number(c, MediaStore.Audio.Media._ID)).toString());
                t.put("title", ZipLibrary.stripExtension(name));
                t.put("tag", text(c, MediaStore.Audio.Media.TITLE));
                t.put("artist", text(c, MediaStore.Audio.Media.ARTIST));
                t.put("album", text(c, MediaStore.Audio.Media.ALBUM));
                t.put("albumId", number(c, MediaStore.Audio.Media.ALBUM_ID));
                t.put("albumArtist", text(c, "album_artist"));
                t.put("genre", text(c, "genre"));
                t.put("year", number(c, MediaStore.Audio.Media.YEAR));
                t.put("track", number(c, MediaStore.Audio.Media.TRACK));
                t.put("added", number(c, MediaStore.Audio.Media.DATE_ADDED));
                t.put("duration", number(c, MediaStore.Audio.Media.DURATION));
                t.put("dir", data.isEmpty() ? "" : new File(data).getParent());
                out.put(t);
            }
        }
        return out;
    }
}
