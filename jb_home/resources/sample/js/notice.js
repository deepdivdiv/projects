/* 공지사항 시안: 현재 페이지의 샘플 목록을 제목·작성자로 검색한다. */
document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('noticeSearch');
    if (!form) return;

    var rows = document.querySelectorAll('[data-notice]');
    var count = document.getElementById('noticeCount');
    var empty = document.getElementById('noticeEmpty');
    var pagination = document.getElementById('noticePagination');

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var type = document.getElementById('noticeSearchType').value;
        var keyword = document.getElementById('noticeKeyword').value.trim().toLocaleLowerCase();
        var matches = 0;

        rows.forEach(function (row) {
            var title = row.querySelector('[data-title]').textContent;
            var author = row.querySelector('[data-author]').textContent;
            var text = type === 'title' ? title : type === 'author' ? author : title + ' ' + author;
            row.hidden = !text.toLocaleLowerCase().includes(keyword);
            if (!row.hidden) matches++;
        });

        count.textContent = String(matches);
        empty.hidden = matches !== 0;
        pagination.hidden = matches === 0;
    });
});
