/*
 * [개발 작성] 교육장 지도(네이버 지도 JavaScript v3). 관리자 교육장 등록 화면과 학습자 과정 상세가 함께 쓴다.
 *
 * 퍼블 소유 파일(static/admin/js/**, static/sample/js/**)을 고치지 않고 새 파일로 둔다(CLAUDE.md).
 *
 * <b>좌표를 저장하지 않는다.</b> 네이버 지도 Maps API 이용약관이 결과 데이터(지오코딩 좌표 포함)를 별도로 저장·DB화·
 * 재사용하는 것을 금지하고 "리턴 받는 즉시 1회 사용" 만 허용하기 때문이다. 그래서 이 파일은 <b>주소를 받아</b>
 * 그 자리에서 지오코딩해 핀을 찍고, 받은 좌표는 그 화면에서만 쓰고 버린다(어디에도 넣지 않는다).
 * 관리자 화면과 학습자 화면이 같은 주소를 보므로 두 화면의 핀은 같은 자리에 찍힌다.
 *
 * 쓰는 법
 *   PlaceMap.renderAll(root)  // root(기본 document) 안의 [data-place-map] 을 그리고 [data-place-directions] 를 손본다.
 *                             // 조각을 갈아끼운 뒤(차수 변경 등) 다시 부른다 — 이미 처리한 것은 건너뛴다.
 *   PlaceMap.render(el)       // 지도 하나. el 의 data-address(필수)·data-label·data-map-height 를 읽는다.
 *   PlaceMap.attachPreview(o) // 관리자 등록 화면: [주소검색] → 주소 채우기 → 그 주소로 핀 찍기(확인용).
 *
 * 전제
 *   - 화면이 네이버 지도 스크립트를 먼저 읽어 둔다(키는 서버 설정 app.naver-map.client-id).
 *     주소를 좌표로 바꾸므로 <b>두 화면 모두</b> 그 스크립트에 submodules=geocoder 가 있어야 한다.
 *   - 스크립트가 없거나(키 미설정·네트워크 차단) 주소가 없으면 <b>아무 것도 하지 않는다</b> —
 *     지도는 안내일 뿐이고 주소·연락처는 화면이 글로 이미 보여 주므로, 지도가 없다고 화면이 깨지지 않아야 한다.
 */
var PlaceMap = (function () {
	'use strict';

	/** 지도 기본 확대 수준. 건물을 가려낼 수 있는 정도(숫자가 크면 더 확대). */
	var DEFAULT_ZOOM = 17;

	/** 네이버 지도 스크립트가 실제로 올라왔는지. 키 미설정·차단 환경에서는 false 다. */
	function mapsReady() {
		return typeof window.naver !== 'undefined' && window.naver.maps && window.naver.maps.Map;
	}

	/** 주소→좌표 변환(geocoder 서브모듈)을 쓸 수 있는지. 아직 받는 중이거나 submodules=geocoder 가 없으면 false 다. */
	function geocoderReady() {
		return mapsReady() && window.naver.maps.Service && window.naver.maps.Service.geocode;
	}

	/** 서브모듈을 기다리는 콜백들과 훅을 한 번만 걸기 위한 표시. */
	var readyWaiters = [];
	var readyHookInstalled = false;

	/**
	 * 지오코딩을 쓸 수 있게 된 뒤에 콜백을 부른다(쓸 수 없으면 false 로 부른다).
	 *
	 * <b>이 기다림이 없으면 지도가 조용히 사라진다.</b> 서브 모듈(geocoder)은 maps.js 가 받아진 뒤
	 * <b>비동기로 더 받으므로</b>, 스크립트가 올라온 직후에는 naver.maps.Map 은 있어도 naver.maps.Service 는 없다.
	 * 그 틈에 지오코딩을 부르면 아무 것도 못 찾은 것처럼 보여 화면이 지도를 접는다 — 학습자 상세가
	 * DOMContentLoaded 에 바로 핀을 찍으려다 실제로 이 틈에 걸렸다(관리자 화면은 사람이 [주소검색]을
	 * 누를 때까지 수 초가 지나 우연히 피하고 있었다).
	 *
	 * 준비 시점은 공식 문서의 훅 naver.maps.onJSContentLoaded 로 잡는다(서브모듈 로드 후 한 번 호출된다).
	 * 주의: 스크립트 주소에 callback= 파라미터를 달면 <b>이 훅은 호출되지 않는다</b>(문서 명시) — 두 화면의
	 * 스크립트 주소에 callback= 을 추가하지 않는다.
	 */
	function whenGeocoderReady(callback) {
		if (geocoderReady()) {
			callback(true);
			return;
		}
		if (!mapsReady()) {
			// 지도 스크립트 자체가 없다(키 미설정·차단). 기다려도 오지 않는다.
			callback(false);
			return;
		}
		readyWaiters.push(callback);
		if (readyHookInstalled) {
			return;
		}
		readyHookInstalled = true;
		// 다른 코드가 이미 걸어 둔 훅이 있으면 함께 불러 준다(이 훅은 한 칸뿐이라 덮어쓰면 그쪽이 사라진다).
		var previousHook = window.naver.maps.onJSContentLoaded;
		window.naver.maps.onJSContentLoaded = function () {
			if (typeof previousHook === 'function') {
				previousHook();
			}
			var ready = geocoderReady();
			var waiters = readyWaiters;
			readyWaiters = [];
			for (var i = 0; i < waiters.length; i++) {
				waiters[i](ready);
			}
		};
	}

	/**
	 * 주소를 좌표로 바꿔 콜백에 넘긴다. 찾지 못하면 null 을 넘긴다(호출부가 지도를 접는다).
	 * 받은 좌표는 그 자리에서 쓰고 버린다 — 저장하거나 다른 곳에 넘기지 않는다(이용약관).
	 * 서브모듈이 아직 안 올라왔으면 올라온 뒤에 부른다(whenGeocoderReady).
	 */
	function geocode(address, callback) {
		if (!address || !mapsReady()) {
			callback(null);
			return;
		}
		whenGeocoderReady(function (ready) {
			if (!ready) {
				callback(null);
				return;
			}
			runGeocode(address, callback);
		});
	}

	function runGeocode(address, callback) {
		window.naver.maps.Service.geocode({ query: address }, function (status, response) {
			if (status !== window.naver.maps.Service.Status.OK
					|| !response.v2.addresses || !response.v2.addresses.length) {
				callback(null);
				return;
			}
			var found = response.v2.addresses[0];
			callback(new window.naver.maps.LatLng(parseFloat(found.y), parseFloat(found.x)));
		});
	}

	/**
	 * 읽기 전용 핀 하나. data-address 를 지오코딩해 그 자리에 핀을 찍는다.
	 * 주소를 찾지 못하면 컨테이너를 감춘다 — 빈 회색 네모가 남으면 학습자는 지도가 고장난 것으로 읽는다.
	 */
	function render(container) {
		if (!container || container.getAttribute('data-place-map-done') === 'true') {
			return;
		}
		// 지오코딩은 비동기라 결과를 기다리는 사이에 renderAll 이 다시 불릴 수 있다 — 먼저 표시해 두고 시작한다.
		container.setAttribute('data-place-map-done', 'true');
		var address = container.getAttribute('data-address');
		if (!mapsReady() || !address) {
			container.style.display = 'none';
			return;
		}
		geocode(address, function (point) {
			if (!point) {
				container.style.display = 'none';
				return;
			}
			// 높이는 그릴 수 있다고 확인된 뒤에 넣는다 — 화면이 미리 주면 못 그리는 환경에서 빈 네모만 남는다.
			// 지도는 만들 때의 컨테이너 크기를 보므로 반드시 생성 전에 넣어야 한다(0 높이면 보이지 않는다).
			container.style.height = container.getAttribute('data-map-height') || '240px';
			var map = new window.naver.maps.Map(container, {
				center: point,
				zoom: DEFAULT_ZOOM,
				// 학습자 화면의 지도는 '여기가 어디인가' 만 보여 주면 되므로 휠 확대는 끈다(페이지 스크롤을 먹는다).
				scrollWheel: false
			});
			new window.naver.maps.Marker({
				position: point,
				map: map,
				title: container.getAttribute('data-label') || ''
			});
			// 길찾기 링크가 좌표를 쓸 수 있으면(터치 기기의 앱 스킴) 방금 받은 값을 그 링크에만 넘긴다.
			applyDirectionsCoord(container, point);
		});
	}

	/**
	 * root 안의 지도 컨테이너를 그리고 길찾기 링크를 손본다.
	 * 조각을 갈아끼운 뒤(차수 변경 등) 다시 부르면 새로 생긴 것만 처리한다.
	 */
	function renderAll(root) {
		var scope = root || document;
		var containers = scope.querySelectorAll('[data-place-map]');
		for (var i = 0; i < containers.length; i++) {
			render(containers[i]);
		}
	}

	/**
	 * 길찾기 링크를 터치 기기에서 앱 스킴으로 바꾼다. 지도에 핀을 찍은 직후(좌표를 손에 들고 있을 때)만 부른다.
	 *
	 * 화면이 심어 두는 기본 href 는 <b>네이버 지도 웹 검색 주소</b>다 — 스크립트가 없어도, 주소를 못 찾아도 눌리고
	 * 좌표가 필요 없다. 터치 기기에서는 문서화된 앱 스킴(nmap://route/public)으로 바꿔 네이버 지도 앱이
	 * 현재 위치에서 길찾기를 열게 한다(출발지를 적지 않으면 현재 위치가 기본값, appname 은 필수 파라미터).
	 *
	 * 앱이 없으면 스킴은 아무 일도 하지 않으므로 터치 기기에서만 바꾼다 — 데스크톱에서 바꿨다가는 눌러도
	 * 반응이 없는 버튼이 된다. 좌표는 이 링크에 담아 즉시 쓰고 저장하지 않는다(이용약관).
	 */
	function applyDirectionsCoord(container, point) {
		if (!isTouchDevice()) {
			return;
		}
		var link = document.querySelector('[data-place-directions]');
		if (!link) {
			return;
		}
		link.href = 'nmap://route/public?dlat=' + point.lat()
				+ '&dlng=' + point.lng()
				+ '&dname=' + encodeURIComponent(container.getAttribute('data-label') || '')
				+ '&appname=' + encodeURIComponent(window.location.hostname);
		// 앱으로 넘기는 주소라 새 탭에서 열 이유가 없다(빈 탭이 남는다).
		link.removeAttribute('target');
	}

	/** 터치 기기인지(= 네이버 지도 앱이 있을 수 있는 기기인지). 길찾기 링크를 앱 스킴으로 바꿀지 정한다. */
	function isTouchDevice() {
		return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
	}

	/**
	 * 관리자 교육장 등록 화면용. [주소검색]으로 주소를 채우고 그 주소로 핀을 찍어 <b>확인만</b> 한다.
	 *
	 * 좌표를 저장하지 않으므로 핀을 끌어 옮길 수 없다(옮겨도 남길 곳이 없다). 여기 보이는 위치는
	 * 학습자 화면이 같은 주소로 그릴 위치와 같다 — 즉 이 지도는 '학습자에게 이렇게 보인다' 의 미리보기다.
	 *
	 * opt = { container, postcodeInput, addressInput, addressDetailInput, statusEl }
	 * 돌려주는 객체의 searchAddress() 가 화면의 [주소검색] 버튼이 부르는 입구다.
	 */
	function attachPreview(opt) {
		if (!opt || !opt.container || !mapsReady()) {
			return null;
		}
		var map = null;
		var marker = null;

		/** 주소로 핀을 다시 찍는다. 지도는 처음 찍을 때 만든다 — 찍을 곳이 없으면 빈 지도를 띄우지 않는다. */
		function locate() {
			var address = valueOf(opt.addressInput).trim();
			if (!address) {
				setStatus(opt.statusEl, '먼저 주소를 입력해 주세요.');
				return;
			}
			// 여기서 geocoderReady() 를 미리 보지 않는다 — 서브모듈이 아직 받는 중일 수 있고, 그때 '불러오지
			// 못했습니다' 로 끊으면 1~2초 뒤 쓸 수 있게 되는 기능을 없다고 말하는 셈이다. geocode 가 기다려 준다.
			setStatus(opt.statusEl, '위치를 찾고 있습니다…');
			geocode(address, function (point) {
				if (!point) {
					// 지오코딩이 못 찾는 주소(신축·지번 누락)도 있다. 저장은 막지 않는다 —
					// 다만 학습자 화면에도 지도가 안 나온다는 사실을 운영자가 알아야 한다.
					opt.container.style.display = 'none';
					setStatus(opt.statusEl, '이 주소로는 지도에서 위치를 찾지 못했습니다. 저장은 되지만 학습자 화면에도 지도가 나오지 않습니다.');
					return;
				}
				opt.container.style.display = '';
				if (!map) {
					opt.container.style.height = opt.container.getAttribute('data-map-height') || '320px';
					map = new window.naver.maps.Map(opt.container, { center: point, zoom: DEFAULT_ZOOM });
					marker = new window.naver.maps.Marker({ position: point, map: map });
				} else {
					map.setCenter(point);
					map.setZoom(DEFAULT_ZOOM);
					marker.setPosition(point);
				}
				setStatus(opt.statusEl, '학습자 화면에도 이 위치가 표시됩니다.');
			});
		}

		/**
		 * [주소검색] — 다음 우편번호 팝업을 열어 주소를 채우고, 고른 그 주소로 핀까지 바로 찍는다.
		 *
		 * 퍼블 공용 핸들러(admin-form.js 의 data-addr-search)를 쓰지 않고 같은 팝업을 직접 여는 이유가 있다 —
		 * 그 핸들러는 주소만 채우고 "끝났다" 를 알려 주지 않아서, 핀을 이어 찍으려면 운영자가 버튼을 한 번 더
		 * 눌러야 했다. 같은 팝업을 우리가 열면 oncomplete 에서 주소와 핀을 함께 처리할 수 있다.
		 * 퍼블 파일은 고치지 않는다.
		 */
		function searchAddress() {
			if (typeof window.daum === 'undefined' || !window.daum.Postcode) {
				setStatus(opt.statusEl, '주소검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
				return;
			}
			new window.daum.Postcode({
				oncomplete: function (data) {
					if (opt.postcodeInput) {
						opt.postcodeInput.value = data.zonecode;
					}
					if (opt.addressInput) {
						opt.addressInput.value = data.roadAddress || data.jibunAddress;
					}
					locate();
					// 상세주소(층·호실)는 팝업이 모르는 값이라 이어서 적게 포커스를 옮긴다(퍼블 핸들러와 같은 동작).
					// 지오코딩에는 쓰지 않는다 — 건물 내부 표기라 오히려 주소를 못 찾게 만든다.
					if (opt.addressDetailInput) {
						opt.addressDetailInput.focus();
					}
				}
			}).open();
		}

		// 수정 화면으로 들어왔고 주소가 이미 있으면 바로 찍어 준다 — 운영자가 보러 온 것이 그 위치다.
		if (valueOf(opt.addressInput).trim()) {
			locate();
		} else {
			opt.container.style.display = 'none';
			setStatus(opt.statusEl, '주소를 검색하면 지도에 위치가 표시됩니다.');
		}

		return { searchAddress: searchAddress, locate: locate };
	}

	function valueOf(input) {
		return input && input.value ? input.value : '';
	}

	function setStatus(statusEl, text) {
		if (statusEl) {
			statusEl.textContent = text;
		}
	}

	return {
		render: render,
		renderAll: renderAll,
		attachPreview: attachPreview,
		mapsReady: mapsReady
	};
})();
