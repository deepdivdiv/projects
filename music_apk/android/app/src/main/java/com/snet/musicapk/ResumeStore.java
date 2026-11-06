package com.snet.musicapk;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 곡별 들은 위치와 폴더별 마지막 곡을 저장한다.
 * 재생 서비스가 직접 쓰기 때문에 화면이 꺼져 있거나 앱 화면이 정리되어도 위치를 잃지 않는다.
 */
final class ResumeStore {

    /** 곡이 이만큼 남았으면 다 들은 것으로 본다. */
    static final long END_MARGIN_MS = 3000;

    private final SharedPreferences prefs;

    ResumeStore(Context context) {
        prefs = context.getSharedPreferences("resume", Context.MODE_PRIVATE);
    }

    static boolean finished(long position, long duration) {
        return duration > 0 && position >= duration - END_MARGIN_MS;
    }

    /** 다 들은 곡은 처음부터, 나머지는 들은 위치부터 시작한다. */
    static long positionToKeep(long position, long duration) {
        return finished(position, duration) ? 0 : Math.max(position, 0);
    }

    /** 다 들었으면 다음에 열 때 다음 곡부터 시작하도록 nextUri를 마지막 곡으로 둔다. */
    void save(String folder, String uri, long position, long duration, String nextUri) {
        long kept = positionToKeep(position, duration);
        SharedPreferences.Editor edit = prefs.edit();
        if (kept > 0) {
            edit.putLong("p:" + uri, kept);
        } else {
            edit.remove("p:" + uri);
        }
        if (folder != null) {
            edit.putString("f:" + folder, finished(position, duration) && nextUri != null ? nextUri : uri);
            edit.putString("last", folder);
        }
        edit.apply();
    }

    /** 다음 곡으로 자동으로 넘어간 곡은 다 들은 곡이다. */
    void clear(String uri) {
        prefs.edit().remove("p:" + uri).apply();
    }

    void rememberFolder(String folder) {
        prefs.edit().putString("last", folder).apply();
    }

    long position(String uri) {
        return prefs.getLong("p:" + uri, 0);
    }

    String lastUri(String folder) {
        return prefs.getString("f:" + folder, null);
    }

    String lastFolder() {
        return prefs.getString("last", null);
    }
}
