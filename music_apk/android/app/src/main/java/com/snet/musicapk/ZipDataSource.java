package com.snet.musicapk;

import android.content.Context;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.PlaybackException;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSourceException;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.TransferListener;
import java.io.IOException;
import java.util.List;
import java.util.Map;

/** ZIP을 풀지 않고 안의 곡을 바로 재생한다. */
final class ZipDataSource extends BaseDataSource {

    private final Context context;
    @Nullable private Uri uri;
    @Nullable private ZipLibrary.EntryStream stream;
    private long remaining;
    private boolean opened;

    ZipDataSource(Context context) {
        super(/* isNetwork= */ false);
        this.context = context;
    }

    @Override
    public long open(@NonNull DataSpec spec) throws IOException {
        uri = spec.uri;
        transferInitializing(spec);
        stream = ZipLibrary.openEntry(context, spec.uri, spec.position);
        if (spec.position > stream.size) {
            throw new DataSourceException(PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE);
        }
        remaining = spec.length != C.LENGTH_UNSET ? spec.length : stream.size - spec.position;
        opened = true;
        transferStarted(spec);
        return remaining;
    }

    @Override
    public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) {
            return 0;
        }
        if (remaining == 0) {
            return C.RESULT_END_OF_INPUT;
        }
        int read = stream.in.read(buffer, offset, (int) Math.min(length, remaining));
        if (read < 0) {
            return C.RESULT_END_OF_INPUT;
        }
        remaining -= read;
        bytesTransferred(read);
        return read;
    }

    @Nullable
    @Override
    public Uri getUri() {
        return uri;
    }

    @Override
    public void close() throws IOException {
        uri = null;
        try {
            if (stream != null) {
                stream.close();
            }
        } finally {
            stream = null;
            if (opened) {
                opened = false;
                transferEnded();
            }
        }
    }

    /** zipentry:// 주소는 ZIP에서, 나머지는 기본 방식으로 읽는다. */
    static final class Factory implements DataSource.Factory {
        private final Context context;
        private final DefaultDataSource.Factory files;

        Factory(Context context) {
            this.context = context.getApplicationContext();
            this.files = new DefaultDataSource.Factory(this.context);
        }

        @NonNull
        @Override
        public DataSource createDataSource() {
            return new Routing(new ZipDataSource(context), files.createDataSource());
        }
    }

    private static final class Routing implements DataSource {
        private final DataSource zip;
        private final DataSource files;
        @Nullable private DataSource current;

        Routing(DataSource zip, DataSource files) {
            this.zip = zip;
            this.files = files;
        }

        @Override
        public void addTransferListener(@NonNull TransferListener listener) {
            zip.addTransferListener(listener);
            files.addTransferListener(listener);
        }

        @Override
        public long open(@NonNull DataSpec spec) throws IOException {
            current = ZipLibrary.ENTRY_SCHEME.equals(spec.uri.getScheme()) ? zip : files;
            return current.open(spec);
        }

        @Override
        public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
            return current.read(buffer, offset, length);
        }

        @Nullable
        @Override
        public Uri getUri() {
            return current == null ? null : current.getUri();
        }

        @NonNull
        @Override
        public Map<String, List<String>> getResponseHeaders() {
            return current == null ? java.util.Collections.emptyMap() : current.getResponseHeaders();
        }

        @Override
        public void close() throws IOException {
            if (current != null) {
                try {
                    current.close();
                } finally {
                    current = null;
                }
            }
        }
    }
}
