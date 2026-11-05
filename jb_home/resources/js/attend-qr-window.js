/*
 * 출석 QR 시간창 — 지금 그 일차의 그 단계를 띄워도 되는지 그 자리에서 알려 준다.
 * [개발 작성] 퍼블 소유 파일(static/sample/js, static/admin/js)을 고치지 않고 새 파일로 둔다.
 *
 * 서버 규칙(OfflineSchedule.findAttendBlocker)과 같은 기준이지만, <b>막는 것은 서버다</b>
 * (AttendQrService.scanUrl · UserCourseAttendService.recordScan). 이 파일은 "왜 QR 이 안 뜨는지" 를
 * 운영자에게 설명하는 몫만 맡는다 — 그래서 운영자 PC 시계가 틀어져 있어도 발급이 열리지는 않고,
 * 반대로 이 판정을 지워도 잘못된 QR 이 발급되지는 않는다.
 *
 * 두 화면이 함께 쓴다 — 차수 탭의 출석 QR 영역(일차·단계를 고르는 쪽)과 교육장에 띄우는 QR 전용 화면
 * (하루 내내 켜 둔 채 종료 시각을 지나는 쪽).
 */
(function (global) {
    'use strict';

    function pad(number) {
        return (number < 10 ? '0' : '') + number;
    }

    /** 09:05 */
    function timeTextOf(date) {
        return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /** 2026-03-02 */
    function dateTextOf(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function sameDay(left, right) {
        return left.getFullYear() === right.getFullYear()
                && left.getMonth() === right.getMonth()
                && left.getDate() === right.getDate();
    }

    /**
     * 띄울 수 없으면 사람이 읽을 사유를, 띄워도 되면 null 을 돌려준다.
     *
     * 교육 중에는 두 단계가 모두 열려 있다 — 지각 입실과 조퇴 퇴실이 정상 운영이라, 시작·종료 시각에 딱 붙여
     * 닫으면 그 두 경우를 찍을 길이 없어진다. 막는 것은 성립할 수 없는 조합뿐이다:
     * 교육일이 아닌 일차 · 시작 전 퇴실 · 종료 후 입실.
     *
     * @param startIso 일차 시작 시각(2026-03-02T09:00 — QrTarget.startDtIso / QrDisplay.startDtIso)
     * @param endIso   일차 종료 시각
     * @param phase    'IN' | 'OUT'
     * @param now      기준 시각(생략하면 지금)
     */
    global.attendQrBlockerOf = function (startIso, endIso, phase, now) {
        // 시각을 읽을 수 없으면 판정하지 않는다 — 화면이 멋대로 막는 것보다 서버 판정에 맡기는 편이 낫다.
        if (!startIso || !endIso) {
            return null;
        }
        var start = new Date(startIso);
        var end = new Date(endIso);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return null;
        }
        var at = now || new Date();

        if (!sameDay(at, start)) {
            return '오늘 교육하는 일차가 아닙니다(교육일 ' + dateTextOf(start) + ').'
                    + ' 오늘 열리는 일차의 QR 을 띄워 주세요.';
        }
        if (phase === 'OUT' && at < start) {
            return '아직 교육 시작 전입니다(시작 ' + timeTextOf(start) + ').'
                    + ' 퇴실 QR 은 교육이 시작된 뒤에 띄울 수 있습니다.';
        }
        if (phase === 'IN' && at > end) {
            return '교육이 끝났습니다(종료 ' + timeTextOf(end) + ').'
                    + ' 입실 QR 은 종료 시각 전까지만 띄울 수 있습니다.';
        }
        return null;
    };
})(window);
