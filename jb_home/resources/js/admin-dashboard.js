/**
 * [개발 작성] 관리자 대시보드(/digital-manager/main)에서 <b>값이 붙으며 새로 생긴 동작</b>만 맡는다.
 * 퍼블 스크립트(admin/js/main.js)를 고치지 않는다 — 고치면 퍼블이 그 파일을 다시 넘길 때 우리 추가분이
 * 조용히 사라지고, 한 파일에 퍼블·개발 작업이 섞여 커밋 이력으로 책임을 가릴 수 없다
 * (학습방 static/js/study-room.js 와 같은 방식).
 *
 * 맡는 것 둘
 *   1) 회원 유형 분포 도넛 — 셀렉트(성별·나이·권한)로 기준을 바꿔 다시 그린다
 *   2) 달력 달 이동 — 서버가 렌더한 조각만 받아 갈아끼운다
 *
 * --- 퍼블 main.js 와 어떻게 갈리는가 ---
 * main.js 는 접속 추이(#access_trend_chart)·일별 학습(#daily_study_chart)·회원 유형 분포(#user_type_chart)
 * 세 칸을 그린다. 앞의 둘은 아직 지표가 정해지지 않아 main.js 가 자기 샘플값으로 그리게 그대로 두고,
 * <b>회원 유형 분포만 이 파일이 통째로 맡는다</b> — 셀렉트로 다시 그려야 해서 '한 번 그리고 끝' 인
 * main.js 의 흐름으로는 담기지 않기 때문이다.
 *
 * 가져오는 방법은 화면의 id 다. 화면(views/admin/index.html)이 그 칸에 main.js 가 찾는 id 대신
 * 개발 전용 id(#user_type_donut / #user_type_donut_legend)를 달아 두었고, 그래서 main.js 의
 * getElementById('user_type_chart') 가 null 이 되어 그 칸을 건너뛴다. main.js 는 한 글자도 고치지 않았다.
 *
 * --- 서버에서 값 넣는 법 ---
 * 컨트롤러가 model 에 "dashboardChart" 를 담으면 화면의 인라인 스크립트가 window.DASHBOARD_CHART 로 옮겨 준다.
 * 이 파일이 읽는 것은 그중 userTypes 하나뿐이고, 기준별로 한 벌씩 들어 있다(키 = 셀렉트의 option value).
 *
 *   window.DASHBOARD_CHART = {
 *     userTypes: {
 *       gender: [ { name: '남성', value: 6120 }, ... ],
 *       age:    [ { name: '20대', value: 1082 }, ... ],
 *       role:   [ { name: '관리자', value: 12 }, ... ]
 *     }
 *   }
 *
 * 값이 없거나 고른 기준이 비어 있으면(회원이 아직 없는 새 사이트) 아래 SAMPLE 로 그린다 — 칸이 비지 않게.
 * 색은 퍼블 main.js 의 도넛 색·utils/_vari.scss 와 같은 값을 여기 상수로 둔다(자바스크립트에서 scss 를 읽을 수 없다).
 */
(function () {
	'use strict';

	// admin/js/main.js 의 DONUT_COLORS 와 같은 값($mCol-60 / $mCol-50 / $mCol-30 / $gray-40).
	var DONUT_COLORS = ['#3060ff', '#6d8fff', '#cbd7ff', '#aea9ba'];
	var LABEL_COLOR = '#8d869b'; // $gray-60
	var TITLE_COLOR = '#3b3844'; // $gray-100

	/**
	 * 달력 조각을 받아 오는 경로. 대시보드 경로(/digital-manager/main) 바로 아래라 지금 주소에서 만든다 —
	 * 배포 컨텍스트가 바뀌어도(/ → /lms) 앞부분이 그대로 따라오고, 화면에 절대경로를 박지 않아도 된다.
	 */
	var CALENDAR_URL = window.location.pathname.replace(/\/+$/, '') + '/calendar';

	/** 서버가 값을 안 넘겼을 때 쓰는 퍼블리싱용 값. 실제 화면에서는 dashboardChart 가 이 자리를 덮는다. */
	var SAMPLE = {
		gender: [
			{ name: '남성', value: 6120 },
			{ name: '여성', value: 5240 },
			{ name: '미입력', value: 1126 }
		],
		age: [
			{ name: '10대 이하', value: 420 },
			{ name: '20대', value: 3180 },
			{ name: '30대', value: 4210 },
			{ name: '40대', value: 2860 },
			{ name: '50대', value: 1320 },
			{ name: '60대 이상', value: 496 }
		],
		role: [
			{ name: '일반 사용자', value: 12474 },
			{ name: '관리자', value: 12 }
		]
	};

	/** 1234 → "1,234" */
	function format(value) {
		return Number(value || 0).toLocaleString('ko-KR');
	}

	/** 서버 문자열을 마크업에 끼워 넣기 전에 스크립트로 읽히지 않게 막는다. */
	function escapeHtml(text) {
		return String(text == null ? '' : text)
				.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	/** 조각 순서대로 색을 돌려 쓴다(묶음이 색 개수보다 많아도 비지 않게). */
	function colorOf(index) {
		return DONUT_COLORS[index % DONUT_COLORS.length];
	}

	/**
	 * 차트를 그릴 칸을 .chart_box 안에 한 겹 만들어 돌려준다.
	 * 차트 높이는 px 가 아니라 '100%' 로 주는데, 라이브러리는 그 100% 를 "차트를 그린 요소의 부모"
	 * 높이에서 잰다. .chart_box 에 바로 그리면 부모가 도넛 줄(.chart_donut)이 되어 엉뚱한 높이를 잡으므로,
	 * 비율로 높이를 정해 둔 .chart_box(main.css) 자신이 부모가 되게 한 겹 둔다.
	 */
	function canvasIn(box) {
		var canvas = document.createElement('div');
		box.appendChild(canvas);
		return canvas;
	}

	// ────────────────────────────── 회원 유형 분포 ──────────────────────────────

	/**
	 * 도넛을 그리고 그 핸들을 돌려준다. 셀렉트로 기준을 바꾸면 같은 칸에 다시 그려야 하는데,
	 * 라이브러리가 그린 결과는 render() 로 붙인 DOM 이라 지우지 않고 또 그리면 둘이 겹친다 —
	 * 그래서 호출하는 쪽이 이전 핸들을 destroy() 할 수 있도록 돌려준다.
	 *
	 * 옵션은 퍼블 main.js 의 도넛과 같은 모양이다(가운데 합계·바깥 밀림 끄기·범례 직접 그리기).
	 */
	function drawDonut(box, legendBox, distributions) {
		var names = [];
		var values = [];
		var colors = [];
		var total = 0;
		for (var index = 0; index < distributions.length; index++) {
			names.push(distributions[index].name);
			values.push(Number(distributions[index].value || 0));
			colors.push(colorOf(index));
			total += Number(distributions[index].value || 0);
		}

		var donut = new ApexCharts(box, {
			chart: { type: 'donut', height: '100%', fontFamily: 'inherit', parentHeightOffset: 0 },
			series: values,
			labels: names,
			colors: colors,
			stroke: { width: 3, colors: ['#ffffff'] },
			dataLabels: { enabled: false },
			legend: { show: false }, // 범례는 아래에서 직접 그린다(도안의 이름·인원·비율 3열)
			plotOptions: {
				pie: {
					// 조각을 클릭하면 라이브러리가 기본으로 그 조각만 바깥으로 밀어낸다(expandOffset:10).
					// 도넛이 카드에 꽉 차 있어 밀려난 조각이 잘려 보이므로 끈다.
					expandOnClick: false,
					donut: {
						size: '72%',
						labels: {
							show: true,
							total: {
								show: true,
								showAlways: true,
								label: '전체',
								color: LABEL_COLOR,
								fontSize: '13px',
								formatter: function () { return format(total) + '명'; }
							},
							// name 이 위(전체), value 가 아래(합계). 라이브러리가 도넛 중심에서
							// name = centerY + offsetY, value = centerY + offsetY + 16 으로 찍는다(+16 은 고정).
							// 그래서 두 값을 대칭으로 두면 블록이 중심보다 아래로 쳐진다 — 함께 올려 중심에 맞춘다.
							name: { color: LABEL_COLOR, fontSize: '13px', offsetY: -14 },
							value: { color: TITLE_COLOR, fontSize: '20px', fontWeight: 700, offsetY: -2 }
						}
					}
				}
			},
			tooltip: { y: { formatter: function (value) { return format(value) + '명'; } } }
		});
		donut.render();

		drawLegend(legendBox, names, values, colors, total);
		return donut;
	}

	/** 도넛과 같은 값·같은 색을 써야 하므로 범례도 여기서 만든다. */
	function drawLegend(legendBox, names, values, colors, total) {
		if (!legendBox) return;

		var rows = [];
		for (var index = 0; index < names.length; index++) {
			var rate = total > 0 ? Math.round(values[index] / total * 100) : 0;
			rows.push('<li>'
					+ '<i class="dot" style="background:' + colors[index] + '"></i>'
					+ '<span class="name">' + escapeHtml(names[index]) + '</span>'
					+ '<span class="count">' + format(values[index]) + '명</span>'
					+ '<span class="rate">' + rate + '%</span>'
					+ '</li>');
		}
		legendBox.innerHTML = rows.join('');
	}

	/**
	 * 기준(성별·나이·권한)을 바꿔 도넛을 다시 그린다.
	 *
	 * 서버를 다시 부르지 않는다 — 세 기준의 집계가 처음 내려올 때 함께 온다(DashboardDto.UserTypeChart 주석).
	 * 고른 기준에 값이 하나도 없으면(회원이 아직 없는 새 사이트) 샘플값으로 대신 그려 칸이 비지 않게 한다.
	 */
	function bindUserTypeFilter(box, legendBox, userTypes) {
		var select = document.querySelector('[data-user-type-filter]');
		var donut = null;

		function redraw() {
			var groupKey = select ? select.value : 'gender';
			var distributions = userTypes[groupKey];
			if (!distributions || !distributions.length) distributions = SAMPLE[groupKey] || SAMPLE.gender;

			// 이전 도넛을 지우고 그린다 — 지우지 않으면 같은 칸에 둘이 겹친다.
			if (donut) donut.destroy();
			box.innerHTML = '';
			donut = drawDonut(canvasIn(box), legendBox, distributions);
		}

		if (select) select.addEventListener('change', redraw);
		redraw();
	}

	// ────────────────────────────── 달력 달 이동 ──────────────────────────────

	/**
	 * 이전/다음 달 버튼. 서버가 렌더한 달력 조각(GET /digital-manager/main/calendar?month=YYYY-MM)만 받아
	 * 통째로 갈아끼운다 — 날짜 표를 만드는 규칙이 서버·클라 두 벌로 갈리지 않는다.
	 *
	 * 리스너는 버튼이 아니라 document 에 한 번만 건다. 조각을 갈아끼우면 버튼도 새 요소로 바뀌는데,
	 * 개별 요소에 걸면 그때마다 다시 매달아야 하고 빠뜨리면 두 번째 이동부터 먹통이 된다.
	 * 조각을 못 받으면 주소로 달을 옮겨(?month=) 전체를 다시 그린다 — 화면이 멈추지 않게.
	 */
	function bindCalendarNav() {
		var pending = 0;   // 연달아 눌렀을 때 늦게 도착한 응답이 최신 달을 덮지 않게 하는 순번

		document.addEventListener('click', function (event) {
			// 위임이라 화면의 아무 곳이나 눌러도 들어온다. target 이 요소가 아닐 수도 있어(합성 이벤트 등) 먼저 막는다.
			if (!event.target || !event.target.closest) return;
			var button = event.target.closest('#dashboard_calendar .cal_head > button');
			if (!button) return;

			var month = button.getAttribute('data-month');
			if (!month) return;

			var requested = ++pending;

			fetch(CALENDAR_URL + '?month=' + encodeURIComponent(month),
					{ headers: { 'X-Requested-With': 'XMLHttpRequest' } })
					.then(function (response) {
						if (!response.ok) throw new Error('calendar fragment ' + response.status);
						return response.text();
					})
					.then(function (html) {
						if (requested !== pending) return;   // 그사이 더 최근 요청이 있었으면 버린다
						var calendar = document.getElementById('dashboard_calendar');
						if (!calendar) throw new Error('dashboard_calendar not found');
						calendar.outerHTML = html;           // 조각이 .la_aside 통째라 outerHTML 로 갈아끼운다
						replaceMonthInUrl();
					})
					.catch(function () {
						if (requested === pending) window.location.search = '?month=' + encodeURIComponent(month);
					});
		});
	}

	/**
	 * 보고 있는 달을 주소에도 남긴다. 새로고침·링크 공유에서 이번 달로 되돌아가지 않게.
	 * 값은 클릭한 버튼이 아니라 <b>새로 받은 조각</b>에서 읽는다 — 서버가 형식이 어긋난 값을 이번 달로
	 * 되돌릴 수 있어(MonthSchedules.monthOf), 실제로 그려진 달과 주소가 갈리면 안 된다.
	 */
	function replaceMonthInUrl() {
		var calendar = document.getElementById('dashboard_calendar');
		var month = calendar && calendar.getAttribute('data-month');
		if (!month) return;
		history.replaceState(null, '', window.location.pathname + '?month=' + encodeURIComponent(month));
	}

	// ────────────────────────────── 시작 ──────────────────────────────

	document.addEventListener('DOMContentLoaded', function () {
		var donutBox = document.getElementById('user_type_donut');
		var calendarBox = document.getElementById('dashboard_calendar');
		if (!donutBox && !calendarBox) return; // 대시보드가 아닌 화면

		// 달력은 차트 라이브러리와 무관하므로 먼저 건다(라이브러리가 없어도 달 이동은 되게).
		if (calendarBox) bindCalendarNav();

		if (!donutBox) return;
		if (typeof ApexCharts === 'undefined') {
			console.error('[admin-dashboard.js] ApexCharts 를 찾지 못했습니다. resource.html 의 apexcharts.min.js 로드를 확인하세요.');
			return;
		}

		var chart = window.DASHBOARD_CHART || {};
		bindUserTypeFilter(donutBox, document.getElementById('user_type_donut_legend'),
				chart.userTypes || SAMPLE);
	});
})();
