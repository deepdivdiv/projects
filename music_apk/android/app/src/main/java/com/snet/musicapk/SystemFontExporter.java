package com.snet.musicapk;

import android.content.Context;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.fonts.Font;
import android.graphics.text.PositionedGlyphs;
import android.graphics.text.TextRunShaper;
import android.os.Build;
import android.widget.TextView;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;

/**
 * 삼성 글꼴 설정은 일반 화면에만 적용되고 WebView에는 적용되지 않는다.
 * 그래서 폰이 실제로 글자를 그릴 때 고르는 글꼴을 알아내 파일로 꺼내고, 화면에서 그 글꼴을 불러온다.
 */
final class SystemFontExporter {

    private static final String HANGUL_RANGE = "U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7FB";
    private static final int TTC_TAG = 0x74746366; // 글꼴 묶음 파일. WebView는 안의 글꼴을 고를 수 없다.

    private SystemFontExporter() {}

    static boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private static final class Face {
        Font font;
        String weight;
        String range;
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private static Font fontFor(Context context, String sample, int style) {
        TextView view = new TextView(context);
        Paint paint = view.getPaint();
        Typeface base = paint.getTypeface() != null ? paint.getTypeface() : Typeface.DEFAULT;
        paint.setTypeface(Typeface.create(base, style));
        PositionedGlyphs glyphs = TextRunShaper.shapeTextRun(sample, 0, sample.length(), 0, sample.length(), 0f, 0f, false, paint);
        return glyphs.glyphCount() == 0 ? null : glyphs.getFont(0);
    }

    /** 글꼴 객체만 찾는다. TextView가 필요해서 메인 스레드에서 부른다. */
    @RequiresApi(api = Build.VERSION_CODES.S)
    static List<Object> find(Context context) {
        List<Object> faces = new ArrayList<>();
        for (String[] sample : new String[][] { { "Abc", null }, { "가나다", HANGUL_RANGE } }) {
            for (int style : new int[] { Typeface.NORMAL, Typeface.BOLD }) {
                Font font = fontFor(context, sample[0], style);
                if (font != null) {
                    Face face = new Face();
                    face.font = font;
                    face.weight = style == Typeface.BOLD ? "700" : "400";
                    face.range = sample[1];
                    faces.add(face);
                }
            }
        }
        return faces;
    }

    private static String nameOf(Font font) {
        File file = font.getFile();
        return file == null ? "사용자 글꼴" : file.getName().replaceFirst("\\.[^.]+$", "");
    }

    private static long checksum(ByteBuffer buffer) {
        CRC32 crc = new CRC32();
        crc.update(buffer.duplicate());
        return crc.getValue();
    }

    /** 찾은 글꼴을 앱 폴더에 저장하고 화면에 넘길 목록을 만든다. */
    @RequiresApi(api = Build.VERSION_CODES.S)
    static JSObject export(Context context, List<Object> found) throws IOException {
        File dir = new File(context.getFilesDir(), "sysfont");
        dir.mkdirs();
        Set<String> used = new HashSet<>();
        Map<String, JSObject> faces = new LinkedHashMap<>();
        String hangulName = null, latinName = null;
        for (Object item : found) {
            Face face = (Face) item;
            ByteBuffer buffer = face.font.getBuffer().duplicate();
            if (buffer.remaining() < 4 || buffer.getInt(buffer.position()) == TTC_TAG) {
                continue;
            }
            File file = new File(dir, Long.toHexString(checksum(buffer)) + ".ttf");
            if (!file.exists() || file.length() != buffer.remaining()) {
                try (FileOutputStream out = new FileOutputStream(file); FileChannel channel = out.getChannel()) {
                    ByteBuffer copy = buffer.duplicate();
                    while (copy.hasRemaining()) {
                        channel.write(copy);
                    }
                }
            }
            used.add(file.getName());
            if (face.range != null) {
                hangulName = nameOf(face.font);
            } else {
                latinName = nameOf(face.font);
            }
            // 굵은 글자도 같은 파일이면 한 번만 등록하고 굵기는 브라우저가 만든다.
            String key = file.getName() + "|" + face.range;
            if (faces.containsKey(key)) {
                continue;
            }
            JSObject out = new JSObject();
            out.put("path", file.getPath());
            out.put("weight", face.weight);
            if (face.range != null) {
                out.put("range", face.range);
            }
            faces.put(key, out);
        }
        File[] old = dir.listFiles();
        if (old != null) {
            for (File file : old) {
                if (!used.contains(file.getName())) {
                    file.delete();
                }
            }
        }
        JSArray list = new JSArray();
        for (JSObject face : faces.values()) {
            list.put(face);
        }
        JSObject result = new JSObject();
        result.put("fonts", list);
        result.put("name", hangulName != null ? hangulName : latinName);
        return result;
    }
}
