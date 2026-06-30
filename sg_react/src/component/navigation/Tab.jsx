import { useState } from "react";
import { Link } from "react-router-dom";

/**
 * 공통 탭버튼 컴포넌트
 *
 * 클래스 규칙: tab-{size} {set}
 *
 * 항목(item)의 동작은 키에 따라 자동 분기됩니다.
 *  - content : 클릭 시 아래 패널 내용을 전환 (탭 전환)
 *  - to      : 클릭 시 라우터 페이지 이동 (SPA, 새로고침 없음)
 *  - href    : 클릭 시 일반 링크 이동 (외부 주소 / 새 탭)
 *
 * @param {"xl"|"l"|"m"|"s"|"xs"} [size="m"]      - 5가지 사이즈
 * @param {"nm"|"nar"|"line"|"ud"} [set="nm"]     - nm: Normal / nar: Narrow / line: Line / ud: Under
 * @param {{label: string, content?: React.ReactNode, to?: string, href?: string}[]} items
 * @param {number} [active]                        - (제어형) 활성 탭 인덱스. 주면 부모가 상태를 관리
 * @param {number} [defaultActive=0]               - (자체형) 최초 활성 탭 인덱스
 * @param {(index: number, item: object) => void} [onChange] - 탭 변경 시 호출
 * @param {string} [className]                     - 추가 클래스 주입
 */


function Tab({
    size = "m",
    set = "nm",
    items = [],
    active,
    defaultActive = 0,
    onChange,
    className = "",
    ...rest
}) {
    // active prop을 주면 제어형, 없으면 모듈이 자체적으로 상태 관리
    const isControlled = active !== undefined;
    const [innerActive, setInnerActive] = useState(defaultActive);
    const current = isControlled ? active : innerActive;

    const handleSelect = (index, item) => {
        if (!isControlled) setInnerActive(index);
        onChange?.(index, item);
    };

    const classes = [`tab-${size}`, set !== "nm" && set, className]
        .filter(Boolean)
        .join(" ");

    const hasPanel = items.some((item) => item.content !== undefined);

    return (
        <>
            <menu className={classes} {...rest}>
                {items.map((item, index) => (
                    <li
                        key={index}
                        className={index === current ? "on" : undefined}
                        onClick={() => handleSelect(index, item)}
                    >
                        {item.to ? (
                            // 라우터 페이지 이동 (SPA)
                            <Link to={item.to}>{item.label}</Link>
                        ) : item.href ? (
                            // 일반 링크 이동 (외부 주소)
                            <a href={item.href} target={item.blank ? "_blank" : undefined}>{item.label}</a>
                        ) : (
                            // 패널 전환 (텍스트만)
                            item.label
                        )}
                    </li>
                ))}
            </menu>

            {/* content를 가진 탭이 있으면 활성 패널을 렌더 */}
            {hasPanel && (
                <div className="tab-panel">
                    {items[current]?.content}
                </div>
            )}
        </>
    );
}

export default Tab;
