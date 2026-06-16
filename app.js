/* ==========================================
   제37회 전북의대 관현악단 정기연주회
   반응형 와이드 웹페이지 인터랙션 스크립트 (PC/모바일 통합)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  initDDayCounter();
  initNavigation();
  initGreetingsAccordion();
  initMemberTabs();
  initAudioDrawer();
  initReviewWidget();
  initMemberTooltips();
});

/* 1. D-Day 카운터 계산 및 표시 */
function initDDayCounter() {
  const badge = document.getElementById('d-day-badge');
  if (!badge) return;

  const targetDate = new Date('2027-01-01T00:00:00');
  const today = new Date();
  
  // 날짜 간격의 소수점 오류 방지를 위해 00:00:00 상태로 일수 계산
  const targetZero = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = targetZero.getTime() - todayZero.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    badge.textContent = `D - ${diffDays}`;
  } else if (diffDays === 0) {
    badge.textContent = 'D-DAY (TODAY)';
    badge.style.background = 'linear-gradient(135deg, #e5c158 0%, #aa7c11 100%)';
    badge.style.color = '#05140b';
  } else {
    badge.textContent = '성료되었습니다';
    badge.style.background = 'rgba(244, 239, 235, 0.12)';
    badge.style.color = 'var(--text-dim)';
    badge.style.boxShadow = 'none';
    badge.style.animation = 'none';
  }
}

/* 2. 상단 네비게이션 & 우측 책갈피 & 스크롤 스파이 */
function initNavigation() {
  const bookmarkButtons = document.querySelectorAll('.bookmark-btn');
  const desktopNavItems = document.querySelectorAll('.desktop-nav-item');
  const sections = document.querySelectorAll('.scroll-section');
  const scrollContainer = document.querySelector('.content-scroll-container');
  let isScrollingByClick = false;

  // 모든 네비게이션 아이템 통합 관리
  const allNavItems = [...bookmarkButtons, ...desktopNavItems];

  // 클릭 이벤트 바인딩
  allNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        isScrollingByClick = true;
        
        // 클릭한 타겟에 맞춰 모든 네비게이션 활성화 상태 강제 업데이트
        updateActiveNavState(targetId);

        // 스크롤 이동
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 스크롤 이동 완료 후 락 해제
        setTimeout(() => {
          isScrollingByClick = false;
        }, 850);
      }
    });
  });

  // 특정 ID에 해당하는 모든 네비게이션 메뉴에 active를 부여하고 나머지는 탈거하는 헬퍼
  function updateActiveNavState(targetId) {
    allNavItems.forEach(nav => {
      if (nav.getAttribute('data-target') === targetId) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });
  }

  // IntersectionObserver 설정 - 화면 스크롤 시 현재 섹션을 상단/우측 네비게이션에 연동
  const observerOptions = {
    root: scrollContainer,
    rootMargin: '-30% 0px -40% 0px', // 스크롤 시 해당 범위 안에 들어오면 액티브 감지
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    if (isScrollingByClick) return; // 메뉴 클릭 이동 중에는 스파이 센서 바이패스

    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // 섹션 페이드인 애니메이션 활성화 클래스 추가
        entry.target.classList.add('active');

        const activeId = entry.target.getAttribute('id');
        updateActiveNavState(activeId);
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));
}

/* 3. 인사말 아코디언 토글 (모바일 뷰에서만 작동) */
function initGreetingsAccordion() {
  const toggleButtons = document.querySelectorAll('.accordion-toggle-btn');

  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.greeting-card');
      const messageContainer = card.querySelector('.message-container');

      if (messageContainer.classList.contains('collapsed')) {
        messageContainer.classList.remove('collapsed');
        messageContainer.classList.add('expanded');
        btn.innerHTML = `접기 <i class="fa-solid fa-chevron-up"></i>`;
      } else {
        messageContainer.classList.remove('expanded');
        messageContainer.classList.add('collapsed');
        btn.innerHTML = `더 보기 <i class="fa-solid fa-chevron-down"></i>`;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });
}

/* 4. 단원 소개 기수별 탭 변경 */
function initMemberTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const layers = document.querySelectorAll('.member-layer');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetGenId = btn.getAttribute('data-gen');

      tabButtons.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      layers.forEach(layer => {
        if (layer.getAttribute('id') === targetGenId) {
          layer.classList.add('active');
        } else {
          layer.classList.remove('active');
        }
      });
    });
  });
}

/* 5. 오디오 플레이어 제어 (슬라이드업 와이드 드로어) */
function initAudioDrawer() {
  const drawer = document.getElementById('audio-drawer');
  const drawerCloseBtn = drawer.querySelector('.drawer-close-btn');
  const drawerPlayBtn = document.getElementById('drawer-play-btn');
  const drawerPlayIcon = drawerPlayBtn.querySelector('i');
  const drawerProgress = document.getElementById('drawer-progress');
  const drawerCurrentTime = document.getElementById('drawer-current-time');
  const drawerDuration = document.getElementById('drawer-duration');
  const drawerTrackTitle = document.getElementById('drawer-track-title');
  const drawerTrackComposer = document.getElementById('drawer-track-composer');

  const previewButtons = document.querySelectorAll('.preview-btn');

  // 백그라운드 단일 공용 오디오 객체
  const sharedAudio = new Audio();
  let progressInterval = null;
  let activeMusicId = null;

  // 곡 리스트별 데이터 정의
  const musicData = {
    "1": {
      title: "Light Cavalry Overture",
      composer: "Franz von Suppé",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      duration: "02:45"
    },
    "2": {
      title: "The Sleeping Beauty Suite, Op. 66a - V. Waltz",
      composer: "Pyotr Ilyich Tchaikovsky",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      duration: "03:12"
    },
    "3": {
      title: "Manon Lescaut - Intermezzo",
      composer: "Giacomo Puccini",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      duration: "04:05"
    },
    "4": {
      title: "아리랑 환상곡",
      composer: "Seonghwan Choi",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      duration: "05:20"
    },
    "5": {
      title: "Symphony No.8 in G major, Op. 88",
      composer: "Antonin Dvořák",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      duration: "06:45"
    }
  };

  previewButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const musicId = btn.getAttribute('data-music-id');
      const selectedMusic = musicData[musicId];

      if (!selectedMusic) return;

      // 이미 재생 중인 곡을 다시 누를 경우 플레이어 토글 및 재생
      if (activeMusicId === musicId) {
        togglePlayState();
        openDrawer();
        return;
      }

      // 새 트랙 설정
      activeMusicId = musicId;
      drawerTrackTitle.textContent = selectedMusic.title;
      drawerTrackComposer.textContent = selectedMusic.composer;
      drawerDuration.textContent = selectedMusic.duration;
      drawerProgress.value = 0;
      drawerCurrentTime.textContent = "00:00";

      sharedAudio.src = selectedMusic.url;
      sharedAudio.load();

      startPlayback();
      openDrawer();
    });
  });

  drawerPlayBtn.addEventListener('click', () => {
    togglePlayState();
  });

  drawerCloseBtn.addEventListener('click', () => {
    closeDrawer();
  });

  drawerProgress.addEventListener('input', () => {
    if (!sharedAudio.duration) return;
    const seekTime = (drawerProgress.value / 100) * sharedAudio.duration;
    sharedAudio.currentTime = seekTime;
    drawerCurrentTime.textContent = formatTime(seekTime);
  });

  function openDrawer() {
    drawer.classList.add('open');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    pausePlayback();
  }

  function togglePlayState() {
    if (sharedAudio.paused) {
      startPlayback();
    } else {
      pausePlayback();
    }
  }

  function startPlayback() {
    sharedAudio.play().catch(err => {
      console.log("Audio playback blocked by security policy.", err);
    });
    drawer.classList.add('playing');
    drawerPlayIcon.className = 'fa-solid fa-pause';
    
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 250);
  }

  function pausePlayback() {
    sharedAudio.pause();
    drawer.classList.remove('playing');
    drawerPlayIcon.className = 'fa-solid fa-play';
    clearInterval(progressInterval);
  }

  function updateProgress() {
    if (!sharedAudio.duration) return;

    const curTime = sharedAudio.currentTime;
    const dur = sharedAudio.duration;
    
    drawerProgress.value = (curTime / dur) * 100;
    drawerCurrentTime.textContent = formatTime(curTime);
    drawerDuration.textContent = formatTime(dur);

    if (sharedAudio.ended) {
      pausePlayback();
      drawerProgress.value = 0;
      drawerCurrentTime.textContent = "00:00";
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

/* 6. 실시간 한줄 기대평 위젯 제어 */
function initReviewWidget() {
  const rwList = document.getElementById('rw-list');
  if (!rwList) return;

  // 요구사항에 따른 기본 예시 기대평 데이터 2개 세팅
  const defaultReviews = ["너무 기대돼요", "공연이 얼른 보고싶어요"];
  
  // 리스트 비우기
  rwList.innerHTML = '';

  // 기본 데이터를 정렬하여 로드 시점 2개가 순서대로 맨 위에 표시되게 함
  // 등록 순서대로 추가하되, 나중에 쓴 것이 위(insertBefore)에 오도록 루프를 실행
  defaultReviews.forEach(text => {
    addReviewItem(text);
  });

  // 전역 폼 제출 처리용 핸들러 등록
  window.submitReview = function(event) {
    event.preventDefault();
    const input = document.getElementById('rw-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
      alert("기대평을 입력해 주세요!");
      return;
    }

    addReviewItem(text);
    input.value = ''; // 작성란 초기화
    
    // 신규 기대평 등록 후 피드 최상단으로 자동 스크롤
    rwList.scrollTop = 0;
  };

  // 개별 기대평 아이템 추가 헬퍼 함수
  function addReviewItem(text) {
    const reviewItem = document.createElement('div');
    reviewItem.className = 'rw-item';
    reviewItem.textContent = text;
    
    // 최신 작성글이 리스트의 맨 위에 오도록 prepend
    rwList.insertBefore(reviewItem, rwList.firstChild);
  }
}

/* 7. 디지털 방명록 모의 액션 함수 */
window.openGuestbookLink = function() {
  const gbBtn = document.querySelector('.guestbook-btn');
  gbBtn.textContent = "방명록으로 연결 중... ✍️";
  gbBtn.style.opacity = "0.8";

  setTimeout(() => {
    window.open("https://forms.google.com", "_blank");
    gbBtn.textContent = "단원들에게 응원 한마디 남기기 ✍️";
    gbBtn.style.opacity = "1";
  }, 1000);
};

/* 8. 메인 뷰포트 진입 시 페이드 인 트리거 */
setTimeout(() => {
  const homeSection = document.getElementById('home');
  if (homeSection) homeSection.classList.add('active');
}, 100);

/* 9. 글로벌 단원별 소감 한마디 툴팁 시스템 */
function initMemberTooltips() {
  try {
    const tooltipBox = document.getElementById('global-tooltip');
    const memberTags = document.querySelectorAll('.member-name-tag');
    const scrollContainer = document.querySelector('.content-scroll-container');

    if (!tooltipBox || memberTags.length === 0) return;

    const tooltipPool = [
      "오랜 기다림 끝에 다시 무대에 서니 정말 감격스럽습니다!",
      "시험 기간보다 더 열심히 연습했어요. 예쁘게 들어주세요!",
      "서로의 소리에 귀 기울이며 완성한 완벽한 하모니를 느껴보세요.",
      "의학과 음악, 두 마리 토끼를 잡느라 밤새웠지만 무대 위라 행복합니다.",
      "드보르작 교향곡의 웅장한 금관 선율에 집중해 주세요!",
      "오늘만큼은 청진기 대신 악기를 잡고 진심을 전합니다.",
      "저희의 정성이 여러분께 따뜻한 위로와 기쁨이 되기를 바랍니다.",
      "2년 만에 울려 퍼지는 저희의 소리, 마음껏 즐겨주세요!",
      "틀리지 않고 무사히 마칠 수 있기를... 악장님 믿습니다!",
      "이 무대를 가능하게 해준 모든 단원들과 선배님들 사랑합니다."
    ];

    // 각 이름 카드에 랜덤 한마디 데이터 심기
    memberTags.forEach(tag => {
      tag.setAttribute('tabindex', '0');

      if (!tag.getAttribute('data-comment')) {
        const randomIndex = Math.floor(Math.random() * tooltipPool.length);
        tag.setAttribute('data-comment', tooltipPool[randomIndex]);
      }

      // 1) 마우스 진입 시 툴팁 표시
      tag.addEventListener('mouseenter', () => {
        showGlobalTooltip(tag);
      });

      // 2) 마우스 이탈 시 툴팁 숨김
      tag.addEventListener('mouseleave', () => {
        hideGlobalTooltip();
      });

      // 3) 모바일 터치 및 클릭 처리
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (tooltipBox.classList.contains('visible') && tooltipBox.getAttribute('data-active-tag') === tag.textContent) {
          hideGlobalTooltip();
        } else {
          showGlobalTooltip(tag);
        }
      });

      // 4) 모바일 터치 이벤트 버블링 방지 (바닥 터치 시 툴팁 닫힘과 간섭 우회)
      tag.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: true });
    });

    // 화면 스크롤, 리사이즈, 기수 탭 전환 시 툴팁 즉시 숨김
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', hideGlobalTooltip);
    }
    window.addEventListener('resize', hideGlobalTooltip);

    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.addEventListener('click', hideGlobalTooltip));

    // 바닥 여백 클릭/터치 시 툴팁 닫기
    document.addEventListener('click', hideGlobalTooltip);
    document.addEventListener('touchstart', hideGlobalTooltip);

    // 글로벌 툴팁 표시 실행 함수
    function showGlobalTooltip(tag) {
      const comment = tag.getAttribute('data-comment');
      if (!comment) return;

      // 텍스트 바인딩
      tooltipBox.textContent = comment;
      tooltipBox.setAttribute('data-active-tag', tag.textContent);

      // 카드의 절대 좌표 계산
      const rect = tag.getBoundingClientRect();
      const tooltipWidth = 195; // CSS의 width와 동일하게 적용
      const tooltipEstimatedHeight = 65; // 대략적인 툴팁 높이 (패딩 + 글자 줄바꿈 고려)
      const headerHeight = window.innerWidth >= 768 ? 70 : 60; // 헤더 높이 분기

      // 툴팁 위치 계산 (기본적으로 카드 가로폭 정중앙 정렬)
      const cardCenter = rect.left + rect.width / 2;
      let leftPos = cardCenter - tooltipWidth / 2;

      // 화면 좌우 밖으로 삐져나가지 않도록 여백(12px) 제한 보정
      const minLeft = 12;
      const maxLeft = window.innerWidth - tooltipWidth - 12;
      const clampedLeft = Math.max(minLeft, Math.min(leftPos, maxLeft));

      // 말풍선 꼬리표(삼각형)의 위치를 카드의 중심 정대각으로 일치시킴
      const arrowRelativeLeft = cardCenter - clampedLeft;
      // 꼬리표가 툴팁 박스를 삐져나가지 않도록 비율(%) 범위(10% ~ 90%) 제한
      const arrowLeftPercent = Math.max(10, Math.min((arrowRelativeLeft / tooltipWidth) * 100, 90));

      tooltipBox.style.left = `${clampedLeft}px`;
      tooltipBox.style.setProperty('--arrow-left', `${arrowLeftPercent}%`);

      // 툴팁이 상단 헤더에 가려지거나 화면 위로 벗어나는 경우 아래로 뒤집기 (Flip)
      if (rect.top - 8 - tooltipEstimatedHeight < headerHeight) {
        tooltipBox.classList.add('tooltip-bottom');
        tooltipBox.style.top = `${rect.bottom + 8}px`;
      } else {
        tooltipBox.classList.remove('tooltip-bottom');
        tooltipBox.style.top = `${rect.top - 8}px`;
      }

      // 가시성 클래스 활성화
      tooltipBox.classList.add('visible');
    }

    // 글로벌 툴팁 숨김 실행 함수
    function hideGlobalTooltip() {
      tooltipBox.classList.remove('visible');
      tooltipBox.classList.remove('tooltip-bottom'); // 뒤집힘 상태 초기화
      tooltipBox.removeAttribute('data-active-tag');
      memberTags.forEach(tag => tag.blur());
    }

  } catch (error) {
    console.error("Error initializing member tooltips:", error);
  }
}
