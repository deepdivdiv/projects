
function SgTypo() {
  return (
    <>
    <div className="sg_tit">
      <h1>TypoGraph</h1>
      <p>텍스트 스타일과 계층 구조를 정의합니다</p>
    </div>
    <div className="sg_area">
        <p>사이즈</p>
        <div className="sg_box typo">
            <dl>
                <dt>$ft-dp-l</dt>
                <dd className="ft-dp-l ft-po"><p>디스플레이 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-dp-m</dt>
                <dd className="ft-dp-m ft-po"><p>디스플레이 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-dp-s</dt>
                <dd className="ft-dp-s ft-po"><p>디스플레이 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-hd-l</dt>
                <dd className="ft-hd-l ft-po"><p>헤드 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-hd-m</dt>
                <dd className="ft-hd-m ft-po"><p>헤드 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-hd-s</dt>
                <dd className="ft-hd-s ft-po"><p>헤드 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-tt-l</dt>
                <dd className="ft-tt-l ft-po"><p>타이틀 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-tt-m</dt>
                <dd className="ft-tt-m ft-po"><p>타이틀 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-tt-s</dt>
                <dd className="ft-tt-s ft-po"><p>타이틀 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-bd-l</dt>
                <dd className="ft-bd-l ft-po"><p>바디 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-bd-m</dt>
                <dd className="ft-bd-m ft-po"><p>바디 텍스트</p></dd>
            </dl>
            <dl>
                <dt>$ft-bd-s</dt>
                <dd className="ft-bd-s ft-po"><p>바디 텍스트</p></dd>
            </dl>
            
            <div className="source">
                <em>SCSS</em>
                <p> h1 &#123; font-size: set.$ft-dp-l; &#125; </p>
            </div>
        </div>
    </div>
    </>
  )
}

export default SgTypo
