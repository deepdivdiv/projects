package com.snet.musicapk;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * 파일 앞부분만 읽어 재생 길이를 구한다. 곡마다 파일 전체를 분석하면 ZIP을 여는 데 오래 걸리기 때문이다.
 * VBR 헤더가 있으면 정확하고, 없으면 비트레이트로 계산한 값이다.
 * 재생이 시작되면 플레이어가 알려주는 실제 길이로 바뀐다.
 */
final class AudioProbe {

    private static final int WINDOW = 64 * 1024;
    private static final int[][] BITRATES = {
        { 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448 }, // MPEG1 Layer1
        { 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384 }, // MPEG1 Layer2
        { 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320 }, // MPEG1 Layer3
        { 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256 }, // MPEG2 Layer1
        { 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160 } // MPEG2 Layer2/3
    };
    private static final int[] SAMPLE_RATES = { 44100, 48000, 32000 };
    private static final int[] ADTS_RATES = { 96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350 };

    private AudioProbe() {}

    /** 알 수 없으면 0을 돌려준다. size는 파일 전체 크기다. */
    static long durationMs(InputStream in, long size, String name) throws IOException {
        byte[] head = new byte[10];
        int got = readFully(in, head, 0, 10);
        if (got < 10) {
            return 0;
        }
        long audioStart = 0;
        byte[] window = new byte[WINDOW];
        int length;
        if (head[0] == 'I' && head[1] == 'D' && head[2] == '3') {
            long tag = ((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | ((head[8] & 0x7F) << 7) | (head[9] & 0x7F);
            audioStart = tag + 10 + ((head[5] & 0x10) != 0 ? 10 : 0);
            skipFully(in, audioStart - 10);
            length = readFully(in, window, 0, WINDOW);
        } else {
            System.arraycopy(head, 0, window, 0, 10);
            length = 10 + readFully(in, window, 10, WINDOW - 10);
        }
        if (length < 12) {
            return 0;
        }
        // 확장자가 아니라 내용으로 판별한다.
        if (matches(window, 0, "OggS")) {
            return oggDuration(in, window, length);
        }
        if (matches(window, 0, "fLaC")) {
            return flacDuration(window, length);
        }
        if (matches(window, 0, "RIFF") && matches(window, 8, "WAVE")) {
            return wavDuration(window, length, size - audioStart);
        }
        if (matches(window, 4, "ftyp")) {
            return mp4Duration(new SequenceInputStream(new ByteArrayInputStream(window, 0, length), in));
        }
        if ((window[0] & 0xFF) == 0xFF && (window[1] & 0xF6) == 0xF0) {
            return adtsDuration(window, length, size - audioStart);
        }
        return name.toLowerCase(Locale.ROOT).endsWith(".mp3") ? mp3Duration(window, length, size - audioStart) : 0;
    }

    private static long flacDuration(byte[] b, int length) {
        if (length < 26) {
            return 0;
        }
        // STREAMINFO: 샘플레이트 20비트, 채널 3, 비트 5, 전체 샘플 수 36비트
        long rate = ((b[18] & 0xFFL) << 12) | ((b[19] & 0xFFL) << 4) | ((b[20] & 0xF0L) >> 4);
        long samples = ((b[21] & 0x0FL) << 32) | readInt(b, 22);
        return rate > 0 ? samples * 1000L / rate : 0;
    }

    private static long wavDuration(byte[] b, int length, long fileSize) {
        long byteRate = 0;
        for (int i = 12; i + 8 <= length; ) {
            long chunk = readIntLittle(b, i + 4);
            if (matches(b, i, "fmt ") && i + 20 <= length) {
                byteRate = readIntLittle(b, i + 16);
            } else if (matches(b, i, "data")) {
                // 녹음기가 만든 파일은 크기가 0이나 최댓값으로 비어 있기도 하다.
                long available = fileSize - i - 8;
                long data = chunk == 0 || chunk > available ? available : chunk;
                return byteRate > 0 ? data * 1000L / byteRate : 0;
            }
            long next = i + 8 + chunk + (chunk & 1);
            if (next > length) {
                return 0;
            }
            i = (int) next;
        }
        return 0;
    }

    /** moov가 파일 끝에 있는 M4A도 있어서 상자를 차례로 건너뛰며 찾는다. */
    private static long mp4Duration(InputStream in) throws IOException {
        byte[] h = new byte[32];
        for (int atoms = 0; atoms < 10000; atoms++) {
            if (readFully(in, h, 0, 8) < 8) {
                return 0;
            }
            long size = readInt(h, 0);
            long header = 8;
            if (size == 1) {
                if (readFully(in, h, 8, 8) < 8) {
                    return 0;
                }
                size = (readInt(h, 8) << 32) | readInt(h, 12);
                header = 16;
            }
            if (matches(h, 4, "moov")) {
                continue; // 안쪽 상자로 들어간다.
            }
            if (matches(h, 4, "mvhd")) {
                if (readFully(in, h, 0, 32) < 32) {
                    return 0;
                }
                boolean wide = h[0] == 1;
                long timescale = readInt(h, wide ? 20 : 12);
                long duration = wide ? (readInt(h, 24) << 32) | readInt(h, 28) : readInt(h, 16);
                return timescale > 0 ? duration * 1000L / timescale : 0;
            }
            if (size < header) {
                return 0; // 크기 0은 파일 끝까지라는 뜻이라 더 찾을 곳이 없다.
            }
            skipFully(in, size - header);
        }
        return 0;
    }

    private static long adtsDuration(byte[] b, int length, long audioSize) {
        int frames = 0, i = 0, rate = 0;
        while (i + 7 <= length && (b[i] & 0xFF) == 0xFF && (b[i + 1] & 0xF6) == 0xF0) {
            int rateIndex = (b[i + 2] >> 2) & 15;
            int frame = ((b[i + 3] & 3) << 11) | ((b[i + 4] & 0xFF) << 3) | ((b[i + 5] & 0xE0) >> 5);
            if (rateIndex >= ADTS_RATES.length || frame < 7) {
                break;
            }
            rate = ADTS_RATES[rateIndex];
            frames++;
            i += frame;
        }
        // 앞부분의 프레임으로 구한 초당 바이트로 전체를 계산한다.
        return frames == 0 || i == 0 ? 0 : audioSize * frames * 1024L * 1000L / i / rate;
    }

    private static long mp3Duration(byte[] b, int length, long audioSize) {
        for (int i = 0; i + 4 <= length; i++) {
            Frame f = Frame.parse(b, i, length);
            if (f == null) {
                continue;
            }
            // 우연히 같은 값이 나온 것이 아닌지 다음 프레임까지 확인한다.
            int next = i + f.bytes;
            if (next + 4 <= length && Frame.parse(b, next, length) == null) {
                continue;
            }
            long frames = vbrFrames(b, i, length, f);
            if (frames > 0) {
                return frames * f.samples * 1000L / f.sampleRate;
            }
            return (audioSize - i) * 8L / f.bitrateKbps;
        }
        return 0;
    }

    private static long vbrFrames(byte[] b, int frame, int length, Frame f) {
        int xing = frame + 4 + (f.mpeg1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17));
        if (xing + 12 <= length && (matches(b, xing, "Xing") || matches(b, xing, "Info")) && (b[xing + 7] & 1) != 0) {
            return readInt(b, xing + 8);
        }
        int vbri = frame + 36;
        if (vbri + 18 <= length && matches(b, vbri, "VBRI")) {
            return readInt(b, vbri + 14);
        }
        return 0;
    }

    private static final class Frame {
        boolean mpeg1;
        boolean mono;
        int bitrateKbps;
        int sampleRate;
        int samples;
        int bytes;

        static Frame parse(byte[] b, int i, int length) {
            if (i + 4 > length || (b[i] & 0xFF) != 0xFF || (b[i + 1] & 0xE0) != 0xE0) {
                return null;
            }
            int version = (b[i + 1] >> 3) & 3; // 0: 2.5, 2: 2, 3: 1
            int layer = (b[i + 1] >> 1) & 3; // 1: III, 2: II, 3: I
            int bitrateIndex = (b[i + 2] >> 4) & 15;
            int rateIndex = (b[i + 2] >> 2) & 3;
            if (version == 1 || layer == 0 || bitrateIndex == 0 || bitrateIndex == 15 || rateIndex == 3) {
                return null;
            }
            Frame f = new Frame();
            f.mpeg1 = version == 3;
            f.mono = ((b[i + 3] >> 6) & 3) == 3;
            int table = f.mpeg1 ? 3 - layer : (layer == 3 ? 3 : 4);
            f.bitrateKbps = BITRATES[table][bitrateIndex - 1];
            f.sampleRate = SAMPLE_RATES[rateIndex] >> (version == 3 ? 0 : version == 2 ? 1 : 2);
            f.samples = layer == 3 ? 384 : (layer == 1 && !f.mpeg1 ? 576 : 1152);
            int padding = (b[i + 2] >> 1) & 1;
            f.bytes = layer == 3
                ? (12 * f.bitrateKbps * 1000 / f.sampleRate + padding) * 4
                : f.samples / 8 * f.bitrateKbps * 1000 / f.sampleRate + padding;
            return f.bytes > 0 ? f : null;
        }
    }

    /**
     * OGG는 앞부분만으로 길이를 알 수 없어(평균 비트레이트는 실제와 몇 배씩 다르다) 마지막 페이지의 샘플 위치를 읽는다.
     * MP3와 달리 끝까지 읽어야 하지만 디코딩은 하지 않는다.
     */
    private static long oggDuration(InputStream in, byte[] window, int length) throws IOException {
        long rate = 0;
        for (int i = 0; i + 28 <= length && i < 512; i++) {
            if (window[i] == 1 && matches(window, i + 1, "vorbis")) {
                rate = readIntLittle(window, i + 12);
                break;
            }
            if (matches(window, i, "OpusHead")) {
                rate = 48000; // Opus의 샘플 위치는 항상 48kHz 기준이다.
                break;
            }
        }
        if (rate <= 0) {
            return 0;
        }
        // 항상 최근 두 구간을 이어서 보관해 페이지 머리가 경계에 걸려도 찾을 수 있게 한다.
        byte[] tail = new byte[WINDOW * 2];
        System.arraycopy(window, 0, tail, 0, length);
        int used = length;
        byte[] chunk = new byte[WINDOW];
        int read;
        while ((read = readFully(in, chunk, 0, WINDOW)) > 0) {
            if (used + read > tail.length) {
                int keep = tail.length - read;
                System.arraycopy(tail, used - keep, tail, 0, keep);
                used = keep;
            }
            System.arraycopy(chunk, 0, tail, used, read);
            used += read;
        }
        for (int i = used - 14; i >= 0; i--) {
            if (matches(tail, i, "OggS")) {
                long granule = readIntLittle(tail, i + 6) | (readIntLittle(tail, i + 10) << 32);
                return granule > 0 ? granule * 1000L / rate : 0;
            }
        }
        return 0;
    }

    private static boolean matches(byte[] b, int i, String text) {
        byte[] t = text.getBytes(StandardCharsets.US_ASCII);
        for (int k = 0; k < t.length; k++) {
            if (b[i + k] != t[k]) {
                return false;
            }
        }
        return true;
    }

    private static long readInt(byte[] b, int i) {
        return ((b[i] & 0xFFL) << 24) | ((b[i + 1] & 0xFFL) << 16) | ((b[i + 2] & 0xFFL) << 8) | (b[i + 3] & 0xFFL);
    }

    private static long readIntLittle(byte[] b, int i) {
        return (b[i] & 0xFFL) | ((b[i + 1] & 0xFFL) << 8) | ((b[i + 2] & 0xFFL) << 16) | ((b[i + 3] & 0xFFL) << 24);
    }

    static int readFully(InputStream in, byte[] buffer, int offset, int length) throws IOException {
        int total = 0;
        while (total < length) {
            int read = in.read(buffer, offset + total, length - total);
            if (read < 0) {
                break;
            }
            total += read;
        }
        return total;
    }

    static void skipFully(InputStream in, long count) throws IOException {
        byte[] scratch = null;
        while (count > 0) {
            long skipped = in.skip(count);
            if (skipped <= 0) {
                if (scratch == null) {
                    scratch = new byte[8192];
                }
                int read = in.read(scratch, 0, (int) Math.min(scratch.length, count));
                if (read < 0) {
                    return;
                }
                skipped = read;
            }
            count -= skipped;
        }
    }
}
