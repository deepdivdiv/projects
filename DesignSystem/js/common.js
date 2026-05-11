document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.bar-m').forEach(bar => {
        const items = bar.querySelectorAll(':scope > li');
        if (!bar.querySelector(':scope > li.on') && items[0]) {
            items[0].classList.add('on');
        }
        items.forEach(li => {
            li.addEventListener('mouseenter', () => {
                items.forEach(el => el.classList.remove('hov'));
                li.classList.add('hov');
            });
            li.addEventListener('click', () => {
                items.forEach(el => el.classList.remove('on'));
                li.classList.add('on');
            });
        });
        bar.addEventListener('mouseleave', () => {
            items.forEach(el => el.classList.remove('hov'));
        });
    });


    // 알림팝업
    
    // 테스트용버튼
    document.querySelector('.alertOpen').addEventListener('click', function() {
        document.querySelector('.alertWrap').classList.add('open');
    });

    document.querySelector('.alertClose').addEventListener('click', function() {
        document.querySelector('.alertWrap').classList.remove('open');
    });

    document.querySelector('.alertWrap').addEventListener('click', function(e) {
        if (!e.target.closest('.alertItem')) {
            this.classList.remove('open');
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelector('.alertWrap').classList.remove('open');
        }
    });


});


