package com.snet.musicapk;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.EOFException;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.io.SequenceInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipException;

/**
 * ZIP 목차와 항목을 읽는다. java.util.zip.ZipFile은 파일 경로만 받는데,
 * 스토어 버전은 경로 없이 사용자가 연결한 폴더의 파일을 받기 때문에 채널에서 직접 읽는다.
 */
final class ZipReader implements Closeable {

    private static final int END_SIGNATURE = 0x06054b50;
    private static final int END64_LOCATOR = 0x07064b50;
    private static final int END64_SIGNATURE = 0x06064b50;
    private static final int CENTRAL_SIGNATURE = 0x02014b50;
    private static final int LOCAL_SIGNATURE = 0x04034b50;
    private static final int MAX_END_SEARCH = 22 + 65535;
    private static final int STORED = 0;
    private static final int DEFLATED = 8;

    static final class Item {
        int index;
        String name;
        boolean directory;
        boolean encrypted;
        int method;
        long compressedSize;
        long size;
        long localOffset;
    }

    private final SeekableByteChannel channel;
    private final Closeable owner;
    private final List<Item> items = new ArrayList<>();

    ZipReader(SeekableByteChannel channel, Closeable owner) throws IOException {
        this.channel = channel;
        this.owner = owner;
        try {
            readDirectory();
        } catch (IOException | RuntimeException e) {
            close();
            throw e instanceof ZipException ? (ZipException) e : asZipError(e);
        }
    }

    private static ZipException asZipError(Exception cause) {
        ZipException error = new ZipException("ZIP 목차를 읽을 수 없습니다.");
        error.initCause(cause);
        return error;
    }

    static ZipReader open(File file) throws IOException {
        RandomAccessFile random = new RandomAccessFile(file, "r");
        return new ZipReader(random.getChannel(), random);
    }

    List<Item> items() {
        return items;
    }

    Item item(int index) throws IOException {
        if (index < 0 || index >= items.size()) {
            throw new IOException("ZIP 안에서 파일을 찾을 수 없습니다.");
        }
        return items.get(index);
    }

    private ByteBuffer read(long position, int length) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        synchronized (channel) {
            channel.position(position);
            while (buffer.hasRemaining()) {
                if (channel.read(buffer) < 0) {
                    throw new EOFException();
                }
            }
        }
        buffer.flip();
        return buffer;
    }

    private void readDirectory() throws IOException {
        long size = channel.size();
        if (size < 22) {
            throw new ZipException("ZIP 파일이 아닙니다.");
        }
        int search = (int) Math.min(size, MAX_END_SEARCH);
        long searchStart = size - search;
        ByteBuffer tail = read(searchStart, search);
        int end = -1;
        for (int i = search - 22; i >= 0; i--) {
            if (tail.getInt(i) == END_SIGNATURE) {
                end = i;
                break;
            }
        }
        if (end < 0) {
            throw new ZipException("ZIP 파일이 아닙니다.");
        }
        long count = tail.getShort(end + 10) & 0xFFFFL;
        long directorySize = tail.getInt(end + 12) & 0xFFFFFFFFL;
        long directoryOffset = tail.getInt(end + 16) & 0xFFFFFFFFL;

        // 4GB가 넘거나 항목이 많은 ZIP은 값이 ZIP64 구역에 따로 들어 있다.
        if (end >= 20 && tail.getInt(end - 20) == END64_LOCATOR) {
            long end64 = tail.getLong(end - 12);
            ByteBuffer record = read(end64, 56);
            if (record.getInt(0) != END64_SIGNATURE) {
                throw new ZipException("ZIP64 목차가 손상되었습니다.");
            }
            count = record.getLong(32);
            directorySize = record.getLong(40);
            directoryOffset = record.getLong(48);
        }
        if (directoryOffset < 0 || directorySize < 0 || directoryOffset + directorySize > size || directorySize > Integer.MAX_VALUE) {
            throw new ZipException("ZIP 목차가 손상되었습니다.");
        }
        ByteBuffer directory = read(directoryOffset, (int) directorySize);
        for (int index = 0; index < count; index++) {
            items.add(readItem(directory, index));
        }
    }

    private static Item readItem(ByteBuffer b, int index) throws ZipException {
        if (b.remaining() < 46 || b.getInt() != CENTRAL_SIGNATURE) {
            throw new ZipException("ZIP 목차가 손상되었습니다.");
        }
        b.position(b.position() + 4); // 버전 두 개
        int flags = b.getShort() & 0xFFFF;
        Item item = new Item();
        item.index = index;
        item.encrypted = (flags & 1) != 0;
        item.method = b.getShort() & 0xFFFF;
        b.position(b.position() + 8); // 시간, CRC
        item.compressedSize = b.getInt() & 0xFFFFFFFFL;
        item.size = b.getInt() & 0xFFFFFFFFL;
        int nameLength = b.getShort() & 0xFFFF;
        int extraLength = b.getShort() & 0xFFFF;
        int commentLength = b.getShort() & 0xFFFF;
        b.position(b.position() + 8); // 디스크 번호, 내부/외부 속성
        item.localOffset = b.getInt() & 0xFFFFFFFFL;
        if (b.remaining() < nameLength + extraLength + commentLength) {
            throw new ZipException("ZIP 목차가 손상되었습니다.");
        }
        byte[] name = new byte[nameLength];
        b.get(name);
        item.name = (flags & 0x800) != 0
            ? new String(name, StandardCharsets.UTF_8)
            : ZipLibrary.decodeName(new String(name, StandardCharsets.ISO_8859_1));
        item.directory = item.name.endsWith("/") || item.name.endsWith("\\");
        readExtra(b, extraLength, item);
        b.position(b.position() + commentLength);
        return item;
    }

    private static void readExtra(ByteBuffer b, int length, Item item) {
        int end = b.position() + length;
        while (b.position() + 4 <= end) {
            int id = b.getShort() & 0xFFFF;
            int size = b.getShort() & 0xFFFF;
            int next = b.position() + size;
            if (next > end) {
                break;
            }
            if (id == 1) { // ZIP64: 0xFFFFFFFF로 표시된 값만 차례로 들어 있다.
                if (item.size == 0xFFFFFFFFL && b.position() + 8 <= next) {
                    item.size = b.getLong();
                }
                if (item.compressedSize == 0xFFFFFFFFL && b.position() + 8 <= next) {
                    item.compressedSize = b.getLong();
                }
                if (item.localOffset == 0xFFFFFFFFL && b.position() + 8 <= next) {
                    item.localOffset = b.getLong();
                }
            }
            b.position(next);
        }
        b.position(end);
    }

    /** 항목을 position 바이트 지점부터 읽는다. 압축 안 된 항목은 바로 이동하고, 압축된 항목은 앞부분을 풀며 넘어간다. */
    InputStream open(Item item, long position) throws IOException {
        if (item.encrypted) {
            throw new ZipException("암호가 걸린 항목입니다.");
        }
        ByteBuffer local = read(item.localOffset, 30);
        if (local.getInt(0) != LOCAL_SIGNATURE) {
            throw new ZipException("ZIP 항목이 손상되었습니다.");
        }
        long data = item.localOffset + 30 + (local.getShort(26) & 0xFFFF) + (local.getShort(28) & 0xFFFF);
        if (item.method == STORED) {
            long skip = Math.min(position, item.size);
            return new Region(data + skip, item.size - skip);
        }
        if (item.method != DEFLATED) {
            throw new ZipException("지원하지 않는 압축 방식입니다.");
        }
        // nowrap 모드는 끝에 빈 바이트가 하나 더 있어야 마지막 블록을 마친다.
        InputStream region = new SequenceInputStream(new Region(data, item.compressedSize), new ByteArrayInputStream(new byte[1]));
        Inflater inflater = new Inflater(true);
        InputStream in = new InflaterInputStream(region, inflater, 64 * 1024) {
            @Override
            public void close() throws IOException {
                super.close();
                inflater.end();
            }
        };
        AudioProbe.skipFully(in, position);
        return in;
    }

    /** ZIP 안의 한 구간만 읽는다. 여러 스트림이 채널을 함께 쓰므로 위치는 각자 가진다. */
    private final class Region extends InputStream {
        private long position;
        private long remaining;

        Region(long position, long length) {
            this.position = position;
            this.remaining = length;
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            return read(one, 0, 1) < 0 ? -1 : one[0] & 0xFF;
        }

        @Override
        public int read(byte[] target, int offset, int length) throws IOException {
            if (length == 0) {
                return 0;
            }
            if (remaining <= 0) {
                return -1;
            }
            ByteBuffer buffer = ByteBuffer.wrap(target, offset, (int) Math.min(length, remaining));
            int read;
            synchronized (channel) {
                channel.position(position);
                read = channel.read(buffer);
            }
            if (read < 0) {
                return -1;
            }
            position += read;
            remaining -= read;
            return read;
        }

        @Override
        public long skip(long count) {
            long skipped = Math.max(0, Math.min(count, remaining));
            position += skipped;
            remaining -= skipped;
            return skipped;
        }
    }

    @Override
    public void close() throws IOException {
        channel.close();
        if (owner != null) {
            owner.close();
        }
    }
}
