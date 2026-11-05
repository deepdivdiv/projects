package com.snet.musicapk;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * MP3의 ID3v2 태그를 읽는다. 안드로이드 기본 분석기는 EUC-KR로 저장된 한글 태그를 깨뜨리는 경우가 많고,
 * 코멘트와 가사는 아예 주지 않아서 직접 읽는다.
 */
final class TagReader {

    /** 화면에 보여줄 순서대로 둔다. */
    static final String[] ORDER = {
        "제목", "아티스트", "앨범", "앨범 아티스트", "장르", "연도", "트랙", "디스크",
        "작곡가", "작사가", "출판사", "BPM", "저작권", "인코딩", "코멘트", "가사"
    };
    private static final Map<String, String> LABELS = new HashMap<>();

    static {
        String[][] ids = {
            { "TIT2", "TT2", "제목" }, { "TPE1", "TP1", "아티스트" }, { "TALB", "TAL", "앨범" },
            { "TPE2", "TP2", "앨범 아티스트" }, { "TCON", "TCO", "장르" }, { "TDRC", "TYE", "연도" },
            { "TYER", "TYE", "연도" }, { "TRCK", "TRK", "트랙" }, { "TPOS", "TPA", "디스크" },
            { "TCOM", "TCM", "작곡가" }, { "TEXT", "TXT", "작사가" }, { "TPUB", "TPB", "출판사" },
            { "TBPM", "TBP", "BPM" }, { "TCOP", "TCR", "저작권" }, { "TSSE", "TSS", "인코딩" },
            { "COMM", "COM", "코멘트" }, { "USLT", "ULT", "가사" }
        };
        for (String[] id : ids) {
            LABELS.put(id[0], id[2]);
            LABELS.put(id[1], id[2]);
        }
    }

    private TagReader() {}

    /** 태그가 없거나 망가졌으면 읽은 데까지만 돌려준다. */
    static Map<String, String> parseId3(byte[] b) {
        Map<String, String> tags = new LinkedHashMap<>();
        if (b.length < 10 || b[0] != 'I' || b[1] != 'D' || b[2] != '3' || b[3] < 2 || b[3] > 4) {
            return tags;
        }
        int version = b[3];
        int flags = b[5];
        int end = (int) Math.min(b.length, 10L + synchsafe(b, 6));
        if ((flags & 0x80) != 0 && version < 4) {
            b = removeUnsync(b, end);
            end = b.length;
        }
        int pos = 10;
        if ((flags & 0x40) != 0 && version >= 3 && end >= 14) {
            pos += version == 4 ? synchsafe(b, 10) : readInt(b, 10) + 4;
        }
        int headerSize = version == 2 ? 6 : 10;
        while (pos >= 10 && pos + headerSize <= end && b[pos] != 0) {
            String id = new String(b, pos, version == 2 ? 3 : 4, StandardCharsets.ISO_8859_1);
            long size;
            int frameFlags = 0;
            if (version == 2) {
                size = ((b[pos + 3] & 0xFF) << 16) | ((b[pos + 4] & 0xFF) << 8) | (b[pos + 5] & 0xFF);
            } else {
                size = version == 4 ? synchsafe(b, pos + 4) : readInt(b, pos + 4);
                frameFlags = b[pos + 9] & 0xFF;
            }
            int data = pos + headerSize;
            if (size <= 0 || data + size > end) {
                break;
            }
            int length = (int) size;
            // 압축되었거나 암호화된 프레임은 해석할 수 없다.
            boolean opaque = version == 3 ? (frameFlags & 0xC0) != 0 : version == 4 && (frameFlags & 0x0C) != 0;
            if (!opaque) {
                int skip = version == 4 && (frameFlags & 0x01) != 0 ? 4 : 0; // 원본 길이 표시
                readFrame(tags, id, b, data + skip, length - skip);
            }
            pos = data + length;
        }
        return tags;
    }

    private static void readFrame(Map<String, String> tags, String id, byte[] b, int start, int length) {
        if (length < 2) {
            return;
        }
        int encoding = b[start];
        int end = start + length;
        String label = LABELS.get(id);
        String value;
        if (id.equals("TXXX") || id.equals("TXX")) {
            int split = terminator(b, start + 1, end, encoding);
            label = text(b, start + 1, split, encoding);
            value = text(b, split + width(encoding), end, encoding);
            // 일부 인코더는 코멘트와 가사를 사용자 정의 칸에 넣는다.
            if (label.equalsIgnoreCase("comment")) {
                label = "코멘트";
            } else if (label.equalsIgnoreCase("lyrics")) {
                label = "가사";
            }
        } else if (label == null) {
            return;
        } else if (id.charAt(0) == 'T') {
            value = text(b, start + 1, end, encoding);
        } else {
            if (length < 5) {
                return;
            }
            int split = terminator(b, start + 4, end, encoding); // 언어 3바이트 뒤의 설명을 건너뛴다.
            String description = text(b, start + 4, split, encoding);
            if (description.startsWith("iTun")) {
                return; // 아이튠즈가 넣는 내부 데이터다.
            }
            value = text(b, split + width(encoding), end, encoding);
        }
        if (label != null && !label.isEmpty() && !value.isEmpty() && !tags.containsKey(label)) {
            tags.put(label, value);
        }
    }

    private static int width(int encoding) {
        return encoding == 1 || encoding == 2 ? 2 : 1;
    }

    private static int terminator(byte[] b, int start, int end, int encoding) {
        int step = width(encoding);
        for (int i = start; i + step <= end; i += step) {
            if (b[i] == 0 && (step == 1 || b[i + 1] == 0)) {
                return i;
            }
        }
        return end;
    }

    private static String text(byte[] b, int start, int end, int encoding) {
        if (start >= end) {
            return "";
        }
        int length = end - start;
        String value;
        switch (encoding) {
            case 1:
                value = new String(b, start, length, StandardCharsets.UTF_16);
                break;
            case 2:
                value = new String(b, start, length, StandardCharsets.UTF_16BE);
                break;
            case 3:
                value = new String(b, start, length, StandardCharsets.UTF_8);
                break;
            default:
                // 표준은 Latin-1이지만 국내 파일은 대부분 CP949를 그대로 넣어 두었다.
                value = ZipLibrary.decodeName(new String(b, start, length, Charset.forName("ISO-8859-1")));
        }
        // 값이 여러 개면 널 문자로 구분되어 있다.
        return value.replaceAll("\\u0000+$", "").replace("\u0000", ", ").replace("﻿", "").trim();
    }

    private static byte[] removeUnsync(byte[] b, int end) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(end);
        for (int i = 0; i < end; i++) {
            out.write(b[i]);
            if (i >= 10 && (b[i] & 0xFF) == 0xFF && i + 1 < end && b[i + 1] == 0) {
                i++;
            }
        }
        return out.toByteArray();
    }

    private static long synchsafe(byte[] b, int i) {
        return ((b[i] & 0x7FL) << 21) | ((b[i + 1] & 0x7FL) << 14) | ((b[i + 2] & 0x7FL) << 7) | (b[i + 3] & 0x7FL);
    }

    private static long readInt(byte[] b, int i) {
        return ((b[i] & 0xFFL) << 24) | ((b[i + 1] & 0xFFL) << 16) | ((b[i + 2] & 0xFFL) << 8) | (b[i + 3] & 0xFFL);
    }
}
