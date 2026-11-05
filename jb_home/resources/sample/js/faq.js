/*
  자주 묻는 질문 시안(views/sample/faq.html): 화면에 적어 둔 아코디언 목록을 분류·검색으로 걸러 낸다.

  분류 탭(li[data-filter])과 아코디언(details[data-state])의 짝은 video_view 의 학습 질문 패널과 같은 규약이고,
  검색은 공지사항(notice.js)과 같이 현재 화면의 샘플 목록을 대상으로 동작한다.
  둘은 함께 걸린다 — 분류를 고른 뒤 검색하면 그 분류 안에서만 찾는다.
*/
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('faqSearch');
    const faqList = document.getElementById('faqList');
    if (!searchForm || !faqList) return;

    const questions = faqList.querySelectorAll('[data-faq]');
    const categoryTabs = document.querySelectorAll('#faqCategory [data-filter]');
    const count = document.getElementById('faqCount');
    const empty = document.getElementById('faqEmpty');
    const pagination = document.getElementById('faqPagination');
    const searchType = document.getElementById('faqSearchType');
    const keywordField = document.getElementById('faqKeyword');

    let category = 'all';

    const applyFilter = () => {
        const type = searchType.value;
        const keyword = keywordField.value.trim().toLocaleLowerCase();
        let shownCount = 0;

        for (const question of questions) {
            const questionText = question.querySelector('[data-question]').textContent;
            const answerText = question.querySelector('[data-answer]').textContent;
            const text = type === 'question' ? questionText
                : type === 'answer' ? answerText
                : questionText + ' ' + answerText;

            const inCategory = category === 'all' || question.dataset.state === category;
            const shown = inCategory && text.toLocaleLowerCase().includes(keyword);

            question.hidden = !shown;
            // 걸러진 항목이 열린 채로 남아 있으면 다시 보일 때 펼쳐진 상태로 나온다.
            if (!shown) question.open = false;
            if (shown) shownCount += 1;
        }

        count.textContent = String(shownCount);
        empty.hidden = shownCount !== 0;
        pagination.hidden = shownCount === 0;
    };

    for (const tab of categoryTabs) {
        tab.addEventListener('click', () => {
            for (const item of categoryTabs) {
                item.classList.toggle('on', item === tab);
            }
            category = tab.dataset.filter;
            applyFilter();
        });
    }

    searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        applyFilter();
    });
});
