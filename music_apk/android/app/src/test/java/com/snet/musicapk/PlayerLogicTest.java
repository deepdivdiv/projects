package com.snet.musicapk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.C;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.SonicAudioProcessor;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.junit.Test;

public class PlayerLogicTest {

    /** 실제 Sonic 처리기를 거친 출력 길이가 입력의 1/배속인지 잰다. */
    private static double outputRatio(float requested, float fromSink) throws Exception {
        PlaybackService.requestedSpeed = requested;
        PlaybackService.SpeedChain chain = new PlaybackService.SpeedChain();
        PlaybackParameters applied = chain.applyPlaybackParameters(new PlaybackParameters(fromSink));
        assertEquals(requested, applied.speed, 0.001f);

        AudioProcessor[] processors = chain.getAudioProcessors();
        SonicAudioProcessor sonic = (SonicAudioProcessor) processors[processors.length - 1];
        sonic.configure(new AudioProcessor.AudioFormat(44100, 2, C.ENCODING_PCM_16BIT));
        sonic.flush();

        int frames = 44100 * 20;
        long in = 0, out = 0;
        ByteBuffer chunk = ByteBuffer.allocateDirect(4096 * 4).order(ByteOrder.nativeOrder());
        for (int frame = 0; frame < frames; ) {
            chunk.clear();
            for (int i = 0; i < 4096 && frame < frames; i++, frame++) {
                short v = (short) (Math.sin(frame * 2 * Math.PI * 440 / 44100) * 12000);
                chunk.putShort(v).putShort(v);
            }
            chunk.flip();
            in += chunk.remaining();
            while (chunk.hasRemaining()) {
                sonic.queueInput(chunk);
                out += sonic.getOutput().remaining();
            }
        }
        sonic.queueEndOfStream();
        ByteBuffer rest;
        while ((rest = sonic.getOutput()).hasRemaining()) {
            out += rest.remaining();
            rest.position(rest.limit());
        }
        return (double) in / out;
    }

    @Test
    public void speedsAboveSinkLimitReachSonic() throws Exception {
        assertEquals(2, outputRatio(2f, 2f), 0.2);
        assertEquals(8, outputRatio(8f, 8f), 0.8);
        // DefaultAudioSink가 8로 잘라 넘겨도 실제 처리는 16배여야 한다.
        assertEquals(16, outputRatio(16f, 8f), 1.6);
    }

    /** 사인파를 이퀄라이저에 통과시켜 출력 크기(dB)를 잰다. */
    private static double eqGainDb(int frequency, int rate, int channels, boolean enabled, float... gains) throws Exception {
        EqProcessor.configure(enabled, gains);
        EqProcessor eq = new EqProcessor();
        eq.configure(new AudioProcessor.AudioFormat(rate, channels, C.ENCODING_PCM_16BIT));
        eq.flush();
        int frames = rate;
        double inPower = 0, outPower = 0;
        long counted = 0;
        ByteBuffer chunk = ByteBuffer.allocateDirect(4096 * 2 * channels).order(ByteOrder.nativeOrder());
        for (int frame = 0; frame < frames; ) {
            chunk.clear();
            int start = frame;
            for (int i = 0; i < 4096 && frame < frames; i++, frame++) {
                short v = (short) (Math.sin(frame * 2 * Math.PI * frequency / rate) * 8000);
                for (int c = 0; c < channels; c++) {
                    chunk.putShort(v);
                }
            }
            chunk.flip();
            eq.queueInput(chunk);
            ByteBuffer out = eq.getOutput();
            for (int f = start; out.remaining() >= 2 * channels; f++) {
                short first = out.getShort();
                for (int c = 1; c < channels; c++) {
                    assertEquals(first, out.getShort()); // 채널끼리 섞이지 않아야 한다.
                }
                if (f > rate / 4) { // 필터가 안정된 뒤부터 잰다.
                    double v = Math.sin(f * 2 * Math.PI * frequency / rate) * 8000;
                    inPower += v * v;
                    outPower += (double) first * first;
                    counted++;
                }
            }
        }
        assertTrue(counted > 0);
        return 10 * Math.log10(outPower / inPower);
    }

    @Test
    public void equalizerShapesFrequencies() throws Exception {
        float[] flat = new float[10];
        assertEquals(0, eqGainDb(1000, 44100, 2, false, flat), 0.01); // 꺼짐: 그대로
        assertEquals(0, eqGainDb(1000, 44100, 2, true, flat), 0.01); // 평평: 그대로

        float[] cut = new float[10];
        cut[5] = -12;
        assertEquals(-12, eqGainDb(1000, 44100, 2, true, cut), 1); // 1kHz 감소
        assertEquals(0, eqGainDb(125, 44100, 2, true, cut), 1); // 다른 대역은 유지

        float[] bass = new float[10];
        bass[2] = 12;
        // 키운 만큼 전체를 낮추므로 125Hz는 그대로, 나머지가 12dB 내려간다.
        assertEquals(0, eqGainDb(125, 44100, 1, true, bass), 1);
        assertEquals(-12, eqGainDb(4000, 44100, 1, true, bass), 1);

        // 48kHz에서도 같은 주파수가 움직이고, 16kHz가 없는 낮은 샘플레이트도 안전하다.
        assertEquals(-12, eqGainDb(1000, 48000, 2, true, cut), 1);
        float[] top = new float[10];
        top[9] = 12;
        assertEquals(0, eqGainDb(1000, 22050, 1, true, top), 0.01);
        EqProcessor.configure(false, flat);
    }

    @Test
    public void equalizerFollowsLiveChangesAndNeverWraps() throws Exception {
        float[] boost = new float[10];
        Arrays.fill(boost, 12);
        EqProcessor.configure(true, boost);
        EqProcessor eq = new EqProcessor();
        eq.configure(new AudioProcessor.AudioFormat(44100, 1, C.ENCODING_PCM_16BIT));
        eq.flush();
        ByteBuffer loud = ByteBuffer.allocateDirect(44100 * 2).order(ByteOrder.nativeOrder());
        for (int i = 0; i < 44100; i++) {
            loud.putShort((short) (i % 2 == 0 ? 32767 : -32768));
        }
        loud.flip();
        eq.queueInput(loud);
        ByteBuffer out = eq.getOutput();
        int previous = 0, wraps = 0;
        while (out.remaining() >= 2) {
            int v = out.getShort();
            if (Math.abs(v - previous) > 60000 && Math.abs(v) < 20000) {
                wraps++;
            }
            previous = v;
        }
        assertEquals(0, wraps);

        // 재생 중에 끄면 다음 구간부터 원음이 그대로 나온다.
        EqProcessor.configure(false, boost);
        ByteBuffer next = ByteBuffer.allocateDirect(8).order(ByteOrder.nativeOrder());
        next.putShort((short) 1000).putShort((short) -1000).putShort((short) 5).putShort((short) 7).flip();
        eq.queueInput(next);
        ByteBuffer same = eq.getOutput();
        assertEquals(1000, same.getShort());
        assertEquals(-1000, same.getShort());
    }

    private static void frame(ByteArrayOutputStream out, String id, byte[] data) throws Exception {
        out.write(id.getBytes(StandardCharsets.US_ASCII));
        out.write(new byte[] { 0, 0, (byte) (data.length >> 8), (byte) data.length, 0, 0 });
        out.write(data);
    }

    private static byte[] id3v23(ByteArrayOutputStream frames) throws Exception {
        ByteArrayOutputStream tag = new ByteArrayOutputStream();
        int n = frames.size();
        tag.write(new byte[] { 'I', 'D', '3', 3, 0, 0, (byte) (n >> 21 & 127), (byte) (n >> 14 & 127), (byte) (n >> 7 & 127), (byte) (n & 127) });
        tag.write(frames.toByteArray());
        return tag.toByteArray();
    }

    private static byte[] latin1Frame(String text, Charset charset) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0);
        out.write(text.getBytes(charset));
        return out.toByteArray();
    }

    @Test
    public void id3TagsDecodeKorean() throws Exception {
        for (String name : new String[] { "tag_v23.mp3", "tag_v24.mp3" }) {
            java.util.Map<String, String> tags = TagReader.parseId3(fixture(name));
            assertEquals(name, "한글 제목", tags.get("제목"));
            assertEquals(name, "홍길동", tags.get("아티스트"));
            assertEquals(name, "첫번째 앨범", tags.get("앨범"));
            assertEquals(name, "발라드", tags.get("장르"));
            assertEquals(name, "2024", tags.get("연도"));
            assertEquals(name, "3/12", tags.get("트랙"));
            assertEquals(name, "메모입니다", tags.get("코멘트"));
        }
    }

    @Test
    public void cp949TagsAndCommentsDecode() throws Exception {
        Charset cp949 = Charset.forName("MS949");
        ByteArrayOutputStream frames = new ByteArrayOutputStream();
        frame(frames, "TALB", latin1Frame("옛날 앨범", cp949));
        frame(frames, "TPE1", latin1Frame("Plain Artist", cp949));
        ByteArrayOutputStream comment = new ByteArrayOutputStream();
        comment.write(new byte[] { 0, 'k', 'o', 'r', 0 });
        comment.write("설명 없는 코멘트".getBytes(cp949));
        frame(frames, "COMM", comment.toByteArray());
        ByteArrayOutputStream itunes = new ByteArrayOutputStream();
        itunes.write(new byte[] { 0, 'e', 'n', 'g' });
        itunes.write("iTunNORM\0 0000".getBytes(StandardCharsets.US_ASCII));
        frame(frames, "COMM", itunes.toByteArray());
        java.util.Map<String, String> tags = TagReader.parseId3(id3v23(frames));
        assertEquals("옛날 앨범", tags.get("앨범"));
        assertEquals("Plain Artist", tags.get("아티스트"));
        assertEquals("설명 없는 코멘트", tags.get("코멘트"));
    }

    @Test
    public void brokenTagsNeverThrow() throws Exception {
        assertTrue(TagReader.parseId3(new byte[0]).isEmpty());
        assertTrue(TagReader.parseId3(fixture("noheader.mp3")).isEmpty());
        byte[] full = fixture("tag_v23.mp3");
        java.util.Random random = new java.util.Random(7);
        for (int i = 0; i < 300; i++) {
            byte[] copy = Arrays.copyOf(full, 10 + random.nextInt(400));
            for (int k = 0; k < 12; k++) {
                copy[10 + random.nextInt(copy.length - 10 == 0 ? 1 : copy.length - 10) % Math.max(1, copy.length - 10)] = (byte) random.nextInt();
            }
            TagReader.parseId3(copy);
        }
    }

    private static List<String> namesThroughZip(Charset writeAs, String... names) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, writeAs)) {
            for (String name : names) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write(1);
                zip.closeEntry();
            }
        }
        List<String> decoded = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes.toByteArray()), StandardCharsets.ISO_8859_1)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                decoded.add(ZipLibrary.decodeName(entry.getName()));
            }
        }
        return decoded;
    }

    @Test
    public void koreanZipNamesDecode() throws Exception {
        List<String> expected = Arrays.asList("1장/시작.mp3", "똠방각하_뷁.mp3", "plain.mp3");
        String[] names = expected.toArray(new String[0]);
        assertEquals(expected, namesThroughZip(Charset.forName("MS949"), names)); // 윈도우 탐색기/알집
        assertEquals(expected, namesThroughZip(StandardCharsets.UTF_8, names)); // UTF-8 표시 있음
    }

    @Test
    public void utf8NamesWithoutFlagDecode() {
        // 맥 등에서 만든 ZIP: UTF-8인데 표시가 없어서 바이트 그대로 들어온다.
        String raw = new String("맥에서_만듬.mp3".getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);
        assertEquals("맥에서_만듬.mp3", ZipLibrary.decodeName(raw));
    }

    @Test
    public void naturalOrderSortsNumbersByValue() {
        List<String> names = new ArrayList<>(Arrays.asList("10강", "2강", "1강", "01강 보충", "a", "B"));
        names.sort(MusicPlayerPlugin.naturalOrder());
        assertTrue(names.indexOf("2강") < names.indexOf("10강"));
        assertTrue(names.indexOf("1강") < names.indexOf("2강"));
        assertTrue(names.indexOf("a") < names.indexOf("B"));
    }

    private static final List<String[]> ONE_ROOT =
        java.util.Collections.singletonList(new String[] { "내장 메모리", "/storage/emulated/0" });

    @Test
    public void crumbsFollowThePath() {
        List<String> names = new ArrayList<>();
        for (String[] c : FileBrowser.crumbs(ONE_ROOT, "/storage/emulated/0/Music/강의")) {
            names.add(c[0] + "=" + c[1]);
        }
        assertEquals(Arrays.asList(
            "내장 메모리=/storage/emulated/0",
            "Music=/storage/emulated/0/Music",
            "강의=/storage/emulated/0/Music/강의"
        ), names);
    }

    @Test
    public void parentStopsAtStorageRoot() {
        assertEquals("/storage/emulated/0", FileBrowser.parentOf(ONE_ROOT, "/storage/emulated/0/Music"));
        assertEquals(null, FileBrowser.parentOf(ONE_ROOT, "/storage/emulated/0"));
        List<String[]> two = Arrays.asList(ONE_ROOT.get(0), new String[] { "SD 카드", "/storage/AB12" });
        assertEquals("", FileBrowser.parentOf(two, "/storage/AB12"));
        assertEquals("저장소", FileBrowser.crumbs(two, "/storage/AB12/x").get(0)[0]);
    }

    private static byte[] fixture(String name) throws Exception {
        try (java.io.InputStream in = PlayerLogicTest.class.getResourceAsStream("/" + name)) {
            return in.readAllBytes();
        }
    }

    private static long probe(String name) throws Exception {
        byte[] data = fixture(name);
        return AudioProbe.durationMs(new ByteArrayInputStream(data), data.length, name);
    }

    @Test
    public void durationsComeFromFileHeads() throws Exception {
        assertEquals(10000, probe("info.mp3"), 150); // Xing/Info 헤더
        assertEquals(10000, probe("noheader.mp3"), 300); // 헤더 없는 CBR
        assertEquals(10000, probe("vbr_art.mp3"), 150); // 앨범아트 + VBR
        assertEquals(10000, probe("mono22k.mp3"), 150); // MPEG2 모노
        assertEquals(10000, probe("tone.ogg"), 150); // 마지막 페이지의 샘플 위치
        assertEquals(10000, probe("tone.opus"), 150);
        assertEquals(10000, probe("tone.wav"), 50);
        assertEquals(10000, probe("list.wav"), 50); // data 앞에 LIST 구간
        assertEquals(10000, probe("tone.flac"), 50);
        assertEquals(10000, probe("moov_end.m4a"), 150);
        assertEquals(10000, probe("moov_start.m4a"), 150);
        assertEquals(10000, probe("tone.aac"), 1500); // 앞부분 프레임으로 추정
        assertEquals(0, AudioProbe.durationMs(new ByteArrayInputStream(new byte[100]), 100, "x.mp3"));
    }

    private static java.io.File zipOf(int method, Charset names, String... entries) throws Exception {
        java.io.File file = java.nio.file.Files.createTempFile("ziptest", ".zip").toFile();
        file.deleteOnExit();
        byte[] mp3 = fixture("vbr_art.mp3");
        try (ZipOutputStream zip = new ZipOutputStream(new java.io.FileOutputStream(file), names)) {
            for (String name : entries) {
                ZipEntry entry = new ZipEntry(name);
                if (method == ZipEntry.STORED) {
                    java.util.zip.CRC32 crc = new java.util.zip.CRC32();
                    crc.update(mp3);
                    entry.setMethod(ZipEntry.STORED);
                    entry.setSize(mp3.length);
                    entry.setCompressedSize(mp3.length);
                    entry.setCrc(crc.getValue());
                }
                zip.putNextEntry(entry);
                zip.write(mp3);
                zip.closeEntry();
            }
        }
        return file;
    }

    @Test
    public void scanSortsAudioAndReadsDurations() throws Exception {
        java.io.File zip = zipOf(ZipEntry.DEFLATED, Charset.forName("MS949"),
            "1장/10_끝.mp3", "1장/2_중간.mp3", "1장/1_시작.ogg", "문서.txt", "__MACOSX/1장/._x.mp3");
        List<String> titles = new ArrayList<>();
        for (ZipLibrary.Entry e : ZipLibrary.scan(zip)) {
            titles.add(e.title);
            if (e.title.endsWith("끝")) {
                assertEquals(10000, e.duration, 150);
                assertEquals("00000.mp3", e.file); // 정렬과 상관없이 ZIP 안 순번을 유지한다.
            }
        }
        assertEquals(Arrays.asList("1_시작", "2_중간", "10_끝"), titles);
    }

    private static void assertReadsFrom(java.io.File zip, int index, int position) throws Exception {
        byte[] mp3 = fixture("vbr_art.mp3");
        try (ZipLibrary.EntryStream entry = ZipLibrary.openEntry(zip, index, position)) {
            assertEquals(mp3.length, entry.size);
            byte[] got = new byte[mp3.length - position];
            assertEquals(got.length, AudioProbe.readFully(entry.in, got, 0, got.length));
            assertTrue(Arrays.equals(Arrays.copyOfRange(mp3, position, mp3.length), got));
            assertEquals(-1, entry.in.read());
        }
    }

    @Test
    public void entriesSeekWithoutExtracting() throws Exception {
        for (int method : new int[] { ZipEntry.DEFLATED, ZipEntry.STORED }) {
            for (Charset names : new Charset[] { Charset.forName("MS949"), StandardCharsets.UTF_8 }) {
                java.io.File zip = zipOf(method, names, "가.mp3", "나.mp3");
                assertReadsFrom(zip, 0, 0);
                assertReadsFrom(zip, 1, 12345);
                assertReadsFrom(zip, 1, fixture("vbr_art.mp3").length - 1);
            }
        }
    }

    @Test
    public void openingIsMuchFasterThanExtractingEverything() throws Exception {
        java.io.File file = java.nio.file.Files.createTempFile("bigzip", ".zip").toFile();
        file.deleteOnExit();
        byte[] body = new byte[6 * 1024 * 1024];
        new java.util.Random(1).nextBytes(body);
        byte[] mp3 = fixture("info.mp3");
        System.arraycopy(mp3, 0, body, 0, mp3.length);
        try (ZipOutputStream zip = new ZipOutputStream(new java.io.FileOutputStream(file))) {
            for (int i = 0; i < 40; i++) {
                zip.putNextEntry(new ZipEntry(i + ".mp3"));
                zip.write(body);
                zip.closeEntry();
            }
        }
        long start = System.nanoTime();
        assertEquals(40, ZipLibrary.scan(file).size());
        long open = System.nanoTime() - start;

        start = System.nanoTime();
        java.io.File out = java.nio.file.Files.createTempFile("bigout", ".bin").toFile();
        out.deleteOnExit();
        byte[] buffer = new byte[64 * 1024];
        try (ZipInputStream zip = new ZipInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(file)));
             java.io.FileOutputStream sink = new java.io.FileOutputStream(out)) {
            while (zip.getNextEntry() != null) {
                int read;
                while ((read = zip.read(buffer)) > 0) {
                    sink.write(buffer, 0, read);
                }
            }
        }
        long extract = System.nanoTime() - start;
        System.out.println("BENCH 240MB/40곡 open=" + open / 1000000 + "ms extract=" + extract / 1000000 + "ms");
        assertTrue(open * 5 < extract);
    }

    @Test
    public void onlyPlayableFilesAreAccepted() {
        assertTrue(ZipLibrary.isAudio("A.MP3"));
        assertTrue(ZipLibrary.isAudio("b.ogg"));
        for (String name : new String[] { "a.wav", "a.FLAC", "a.m4a", "a.aac", "a.opus", "a.amr", "a.mka" }) {
            assertTrue(name, ZipLibrary.isAudio(name));
        }
        for (String name : new String[] { "a.wma", "a.APE", "a.aiff", "a.mid" }) {
            assertTrue(name, ZipLibrary.isUnplayableAudio(name));
            assertTrue(name, !ZipLibrary.isAudio(name));
        }
        assertEquals("강의.1장", ZipLibrary.stripExtension("강의.1장.flac"));
        assertEquals("곡", ZipLibrary.stripExtension("곡.wma"));
        assertEquals("readme.txt", ZipLibrary.stripExtension("readme.txt"));
        assertTrue(!ZipLibrary.isAudio("mp3"));
        assertTrue(!ZipLibrary.isAudio("notes.txt"));
        assertEquals("곡", ZipLibrary.stripExtension("곡.OGG"));
    }
}
