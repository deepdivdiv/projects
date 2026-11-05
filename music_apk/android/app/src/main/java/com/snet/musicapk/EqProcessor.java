package com.snet.musicapk;

import androidx.annotation.NonNull;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * 10밴드 이퀄라이저. 재생 경로 안에서 직접 처리해 기기마다 다르게 동작하지 않는다.
 * 배속(Sonic)보다 앞에 있어서 배속을 바꿔도 주파수가 어긋나지 않는다.
 */
final class EqProcessor extends BaseAudioProcessor {

    static final int[] FREQUENCIES = { 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 };
    private static final double Q = 1.41; // 한 옥타브 폭

    /** null이면 끈 상태다. */
    private static volatile float[] activeGains;

    private float[] appliedGains;
    private double[][] coefficients = new double[0][]; // 밴드별 b0 b1 b2 a1 a2
    private double[][] state = new double[0][]; // 밴드별 채널마다 z1 z2
    private double preamp = 1;

    static void configure(boolean enabled, float[] gainsDb) {
        activeGains = enabled ? gainsDb.clone() : null;
    }

    @NonNull
    @Override
    protected AudioFormat onConfigure(@NonNull AudioFormat format) throws UnhandledAudioFormatException {
        if (format.encoding != C.ENCODING_PCM_16BIT) {
            throw new UnhandledAudioFormatException(format);
        }
        appliedGains = null;
        return format;
    }

    private void prepare(float[] gains) {
        appliedGains = gains;
        coefficients = new double[0][];
        state = new double[0][];
        preamp = 1;
        if (gains == null) {
            return;
        }
        int rate = inputAudioFormat.sampleRate;
        int channels = inputAudioFormat.channelCount;
        double[][] bands = new double[FREQUENCIES.length][];
        int count = 0;
        float boost = 0;
        for (int i = 0; i < FREQUENCIES.length && i < gains.length; i++) {
            // 나이퀴스트 근처 주파수는 필터가 불안정해진다.
            if (Math.abs(gains[i]) < 0.05f || FREQUENCIES[i] >= rate * 0.45) {
                continue;
            }
            boost = Math.max(boost, gains[i]);
            bands[count++] = peaking(FREQUENCIES[i], gains[i], rate);
        }
        coefficients = Arrays.copyOf(bands, count);
        state = new double[count][channels * 2];
        preamp = Math.pow(10, -boost / 20); // 키운 만큼 낮춰 소리가 찢어지지 않게 한다.
    }

    private static double[] peaking(double frequency, double gainDb, double rate) {
        double a = Math.pow(10, gainDb / 40);
        double w = 2 * Math.PI * frequency / rate;
        double alpha = Math.sin(w) / (2 * Q);
        double cos = Math.cos(w);
        double a0 = 1 + alpha / a;
        return new double[] {
            (1 + alpha * a) / a0, -2 * cos / a0, (1 - alpha * a) / a0, -2 * cos / a0, (1 - alpha / a) / a0
        };
    }

    @Override
    public void queueInput(@NonNull ByteBuffer input) {
        int size = input.remaining();
        if (size == 0) {
            return;
        }
        ByteBuffer output = replaceOutputBuffer(size);
        float[] gains = activeGains;
        if (gains != appliedGains) {
            prepare(gains);
        }
        if (coefficients.length == 0 && preamp == 1) {
            output.put(input);
            output.flip();
            return;
        }
        int channels = inputAudioFormat.channelCount;
        int channel = 0;
        while (input.remaining() >= 2) {
            double sample = input.getShort() * preamp;
            for (int band = 0; band < coefficients.length; band++) {
                double[] c = coefficients[band];
                double[] z = state[band];
                int s = channel * 2;
                double y = c[0] * sample + z[s];
                z[s] = c[1] * sample - c[3] * y + z[s + 1];
                z[s + 1] = c[2] * sample - c[4] * y;
                sample = y;
            }
            long rounded = Math.round(sample);
            output.putShort((short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, rounded)));
            channel = channel + 1 == channels ? 0 : channel + 1;
        }
        input.position(input.limit());
        output.flip();
    }

    @Override
    protected void onFlush() {
        for (double[] z : state) {
            Arrays.fill(z, 0);
        }
    }

    @Override
    protected void onReset() {
        appliedGains = null;
        coefficients = new double[0][];
        state = new double[0][];
        preamp = 1;
    }
}
