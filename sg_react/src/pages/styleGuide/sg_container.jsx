import React, {useRef, useState, useEffect} from "react";
import { Button } from "@/component/form";
import { Card, sstModal, sstDialog, Acc } from "@/component/container";
// import ThumbIMG from "@/assets/thumb.png";

function SgDisplay() {
    const sections = [
        { id: "card", label: "Card" },
        { id: "modal", label: "Modal" },
        { id: "dialog", label: "Dialog" },
        { id: "acc", label: "Accordion" },
    ];

    
    const [cardData, setCardData] = useState({ list: [], grid: [], visual: [], price: [] });

    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}cardData.json`)   // 1. 서버에 데이터 요청 (base 경로 자동 반영)
            .then((res) => res.json())       // 2. 응답을 JSON으로 해석
            .then((data) => setCardData(data)) // 3. state에 저장 → 화면 다시 그려짐
            .catch((err) => console.error("카드 데이터 불러오기 실패:", err));
    }, []); 

    // 리스트 / 그리드 / 비주얼 / 가격
    const cardList = cardData.list.map((item) => ({ ...item }));
    const cardGrid = cardData.grid.map((item) => ({ ...item }));
    const cardVisual = cardData.visual.map((item) => ({ ...item }));
    const cardPrice = cardData.price.map((item) => ({ ...item }));


    const secRefs = useRef({});
    const [activeSec, setActiveSec] = useState(sections[0].id);

    const onMoveToSec = (id) => {
        secRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // 화면에 들어온 DOM에 해당하는 섹션 id를 찾아 활성화
                        const id = Object.keys(secRefs.current).find(
                            (key) => secRefs.current[key] === entry.target
                        )
                        if (id) setActiveSec(id)
                    }
                })
            },
            { rootMargin: "-50% 0px -50% 0px" } // 화면 중앙을 지나는 섹션을 활성화
        )

        Object.values(secRefs.current).forEach((el) => el && observer.observe(el))
        return () => observer.disconnect()
    }, [])

    return (
    <>
        {/* 섹션 이동 메뉴 */}
        <menu className="secGuide">
            {sections.map((sec) => (
                <button
                    key={sec.id}
                    type="button"
                    className={activeSec === sec.id ? "active" : ""}
                    onClick={() => onMoveToSec(sec.id)}
                >{sec.label}</button>
            ))}
        </menu>
        <div className="sg_inner" ref={(el) => (secRefs.current.card = el)}>
            <div className="sg_tit">
                <h1>Card</h1>
                <p>여러 사이즈의 카드 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>List</dt>
                        <dd>
                            <Card set="list" items={cardList} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Grid</dt>
                        <dd>
                            <Card set="grid" items={cardGrid} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Visual</dt>
                        <dd>
                            <Card set="visual" items={cardVisual} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Prize</dt>
                        <dd>
                            <Card set="prize" items={cardPrice} />
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Progress size="l" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
<Progress size="m" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
<Progress size="s" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 스타일 */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">

                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">

                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Progress size="l" value="25" max="100"></Progress>
<Progress size="l" value="25" max="100" state="ne"></Progress>
<Progress size="l" value="25" max="100" state="er"></Progress>
<Progress size="l" value="25" max="100" state="ca"></Progress>
<Progress size="l" value="25" max="100" state="su"></Progress>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.modal = el)}>
            <div className="sg_tit">
                <h1>Modal</h1>
                <p>화면 중앙에 띄워 확인/취소를 받는 모달 컴포넌트</p>
            </div>
            {/* 아이콘 타입 */}
            <div className="sg_area">
                <p>아이콘 타입</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ title: "기본 모달입니다.", text: "내용이 들어갑니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "comple", title: "정상적으로 처리되었습니다.", text: "변경사항이 저장되었습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "error", title: "오류가 발생했습니다.", text: "잠시 후 다시 시도해 주세요." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Warning</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "warning", title: "주의가 필요합니다.", text: "이 작업은 되돌릴 수 없습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Info</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "info", title: "안내 메시지입니다.", text: "참고하시기 바랍니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Question</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "quest", title: "확인이 필요합니다.", text: "계속 진행하시겠습니까?" })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`import { sstModal } from "@/component/container";

sstModal({ title: "기본 모달입니다.", text: "내용이 들어갑니다." });
sstModal({ icon: "comple", title: "정상적으로 처리되었습니다." });
sstModal({ icon: "error", title: "오류가 발생했습니다." });
sstModal({ icon: "warning", title: "주의가 필요합니다." });
sstModal({ icon: "info", title: "안내 메시지입니다." });
sstModal({ icon: "quest", title: "확인이 필요합니다." });
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 옵션 */}
            <div className="sg_area">
                <p>옵션</p>
                <div className="sg_box">
                    <dl>
                        <dt>확인 + 취소</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "quest", title: "삭제하시겠습니까?", text: "삭제된 데이터는 복구할 수 없습니다.", showCancel: true })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>버튼 텍스트 변경</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "warning", title: "정말 나가시겠습니까?", text: "작성 중인 내용이 사라집니다.", showCancel: true, confirmText: "나가기", cancelText: "머무르기" })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>콜백 처리</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "quest", title: "저장하시겠습니까?", text: "확인을 누르면 콜백이 실행됩니다.", showCancel: true, onConfirm: () => sstModal({ icon: "comple", title: "저장되었습니다." }) })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>버튼 없음</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstModal({ icon: "info", title: "버튼이 없는 모달입니다.", text: "배경이나 닫기 버튼으로 닫습니다.", showConfirm: false })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`// 확인 + 취소 버튼
sstModal({ icon: "quest", title: "삭제하시겠습니까?", showCancel: true });

// 버튼 텍스트 변경
sstModal({ title: "...", showCancel: true, confirmText: "나가기", cancelText: "머무르기" });

// 콜백 (false 반환 시 모달이 닫히지 않음)
sstModal({ title: "...", showCancel: true, onConfirm: () => { /* 처리 */ }, onCancel: () => {} });

// 버튼 숨기기 (배경/닫기 버튼으로만 닫힘)
sstModal({ icon: "info", title: "...", showConfirm: false });
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>


        <div className="sg_inner" ref={(el) => (secRefs.current.dialog = el)}>
            <div className="sg_tit">
                <h1>Dialog</h1>
                <p>입력 폼·표를 끼워 넣을 수 있는 확장형 모달</p>
            </div>
            {/* 아이콘 타입 */}
            <div className="sg_area">
                <p>아이콘 타입</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({ title: "기본 다이얼로그입니다.", text: "내용이 들어갑니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({ icon: "comple", title: "정상적으로 처리되었습니다.", text: "변경사항이 저장되었습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Question</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({ icon: "quest", title: "확인이 필요합니다.", text: "계속 진행하시겠습니까?", showCancel: true })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`import { sstDialog } from "@/component/container";

sstDialog({ title: "기본 다이얼로그입니다.", text: "내용이 들어갑니다." });
sstDialog({ icon: "comple", title: "정상적으로 처리되었습니다." });
sstDialog({ icon: "quest", title: "확인이 필요합니다.", showCancel: true });
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 폼 / 표 */}
            <div className="sg_area">
                <p>폼 / 표</p>
                <div className="sg_box">
                    <dl>
                        <dt>입력 폼</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({
                                title: "이름을 입력하세요",
                                showCancel: true,
                                form: (
                                    <input type="text" name="userName" placeholder="이름" />
                                ),
                                onConfirm: (formEl) => {
                                    const name = formEl?.querySelector("[name='userName']")?.value;
                                    sstDialog({ icon: "comple", title: `입력한 이름: ${name || "(없음)"}` });
                                },
                            })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>표</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({
                                title: "주문 정보",
                                showCancel: true,
                                table: (
                                    <>
                                        <tr><th>상품명</th><td>키보드</td></tr>
                                        <tr><th>수량</th><td>2개</td></tr>
                                        <tr><th>금액</th><td>120,000원</td></tr>
                                    </>
                                ),
                            })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`// 입력 폼 — onConfirm(formEl) 에서 input 값 읽기
sstDialog({
  title: "이름을 입력하세요",
  showCancel: true,
  form: <input type="text" name="userName" placeholder="이름" />,
  onConfirm: (formEl) => {
    const name = formEl.querySelector("[name='userName']").value;
    // ...처리
  },
});

// 표 — table 에 <tr> 들을 넘김 (tbody 안에 렌더됨)
sstDialog({
  title: "주문 정보",
  table: (
    <>
      <tr><th>상품명</th><td>키보드</td></tr>
      <tr><th>수량</th><td>2개</td></tr>
    </>
  ),
});
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 옵션 */}
            <div className="sg_area">
                <p>옵션</p>
                <div className="sg_box">
                    <dl>
                        <dt>버튼 텍스트 변경</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({ icon: "warning", title: "정말 나가시겠습니까?", text: "작성 중인 내용이 사라집니다.", showCancel: true, confirmText: "나가기", cancelText: "머무르기" })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>버튼 없음</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstDialog({ icon: "info", title: "버튼이 없는 다이얼로그입니다.", text: "배경이나 닫기 버튼으로 닫습니다.", showConfirm: false, showCancel: false })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`// 버튼 텍스트 변경
sstDialog({ title: "...", showCancel: true, confirmText: "나가기", cancelText: "머무르기" });

// 콜백 (false 반환 시 닫히지 않음)
sstDialog({ title: "...", onConfirm: (formEl, tableEl) => { /* 처리 */ } });

// 버튼 숨기기 (배경/닫기 버튼으로만 닫힘)
sstDialog({ icon: "info", title: "...", showConfirm: false, showCancel: false });
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>


        <div className="sg_inner" ref={(el) => (secRefs.current.acc = el)}>
            <div className="sg_tit">
            <h1>Accordion</h1>
            <p>Accordion</p>
            </div>
            <div className="sg_area">
            <div className="sg_box">
                <dl>
                    <dt>L</dt>
                    <dd>
                        <Acc size="l" items={cardList}></Acc>
                    </dd>
                </dl>
                <dl>
                    <dt>M</dt>
                    <dd>
                        <Acc size="m" items={cardList}></Acc>
                    </dd>
                </dl>
                <dl>
                    <dt>S</dt>
                    <dd>
                        <Acc size="s" items={cardList}></Acc>
                    </dd>
                </dl>
                <div className="source">
                    <em>JSX</em>
                    <xmp>
{`<Acc size="l" items={cardList}></Acc>
<Acc size="m" items={cardList}></Acc>
<Acc size="s" items={cardList}></Acc>
`}
                    </xmp>
                </div>
            </div>
            </div>

        </div>


    </>
    )
}

export default SgDisplay
