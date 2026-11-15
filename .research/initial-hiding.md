# 초기 숨김 지연과 선택자 자체 복구 조사

2026-11-15 · 조사만 수행. 기준 커밋은 `f485ab697aa0ef4a6d3c0bef95daee48230cf1ea`이며, 동시에 진행되는 UI 변경이 있는 작업 트리의 소스를 읽었다. 이 보고서 외에는 코드·테스트·설정·사용자 브라우저 데이터를 변경하지 않았다.

**권고:** 전체 페이지의 150ms 공개 예산은 유지하고, 공개와 사전 숨김 취소를 분리한다. 정상적으로 완료된 늦은 CSS는 해당 문서·사이트 설정·규칙이 여전히 유효할 때 적용한다. 일반 숨김은 UI 준비와 독립해서 시작하고, 확실히 다시 찾은 요소의 선택자는 기존 생성 함수와 백그라운드(background) 변경 큐를 통해 DB와 사전 CSS 캐시에 함께 반영한다. 새 권한·저장 스키마·의존성은 필요하지 않다. 이것은 노출 시간을 줄이고 다음 방문을 복구하는 방안이며, 구조가 바뀐 첫 방문까지 노출 0회를 보장하는 방안은 아니다. 근거와 필요한 안전 조건은 아래에 구분했다.

## 근거의 범위

- **확인한 사실:** 아래 링크의 현행 공식 API 문서·HTML 사양을 웹에서 직접 확인했고, 링크한 저장소 함수와 호출자를 읽었다. 네이티브 API 실행이나 성능 수치는 새로 측정하지 않았다.
- **인계된 관찰:** 기존 Chrome 19개 검증 통과, 저장소 응답을 260ms 지연하면 약 150ms에 공개된 뒤 늦은 CSS가 버려짐, 유효하지만 불일치하는 `#old-target` 노출, 네이버의 현재 선택자 4개가 각각 1개씩 일치하고 새로고침·강력 새로고침·재진입에서 초기 5초의 rAF 노출 0회라는 결과는 요청자가 제공했다. 이 조사에서 재실행한 결과로 취급하지 않는다. 기존 검증의 시나리오와 관측 방식은 [verify-preload.ts:92](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:92), [프레임 관측:320](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:320)에서 확인했다.
- **추론·권고:** 현재 제어 흐름과 공식 API 제약에서 도출한 변경안이다. 구현 후 실제 저장·복원·첫 표시 경로로 확인해야 한다.

## 1. 사용자별 CSS를 미리 등록할 수 있는가

| 수단 | 확인한 사실 | 이번 작업에 대한 판단 |
| --- | --- | --- |
| 정적 `content_scripts.css` | Chrome은 등록된 CSS 파일을 DOM 구성·표시 전에 주입한다. `document_start` JS는 그 CSS 뒤에 실행된다. [Chrome 콘텐츠 스크립트 문서](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#inject_with_static_declarations) | 패키지에 고정된 CSS에는 적합하다. 사용자마다 다른 선택자 문자열을 설치 후 바꾸는 저장소는 아니다. |
| `scripting.registerContentScripts` | `RegisteredContentScript.css`는 CSS **파일 목록**이고, `persistAcrossSessions`의 기본값은 `true`다. 문자열 CSS 본문을 받는 필드가 없다. `scripting`과 대상 URL 접근 권한이 필요하며, 등록 해제는 이미 주입된 스타일을 제거하지 않는다. [Chrome 타입·등록 API](https://developer.chrome.com/docs/extensions/reference/api/scripting#type-RegisteredContentScript), [Mozilla 등록 API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/registerContentScripts) | 영속 등록 자체는 가능하지만, 사용자별 CSS 문자열을 파일 경로처럼 전달할 수 없다. 고정 JS 파일을 등록해서 매번 저장소를 읽으면 현재의 비동기 의존성이 남는다. |
| `scripting.insertCSS({css})` | CSS 문자열을 현재 대상 문서에 주입할 수 있고, 완료를 Promise로 돌려준다. `removeCSS`에는 삽입 때와 같은 CSS·파일·출처 정보가 필요하다. [Chrome 주입 API](https://developer.chrome.com/docs/extensions/reference/api/scripting#method-insertCSS) | 다음 문서를 위한 영속 등록이 아니다. 탐색 이벤트 → 백그라운드 기동 → 저장소 읽기 → 주입을 거치면 첫 표시 전에 끝난다고 보장할 수 없다. 현재 DOM 스타일 제거에 맞춘 복원 경로도 함께 바꿔야 하므로 우선 선택하지 않는다. |
| Chrome `userScripts.register` | JS 본문을 `js: [{code: ...}]`로 등록하고 `runAt`을 지정할 수 있다. Chrome 120+의 MV3 API이며 `userScripts` 및 호스트 권한이 필요하다. Chrome 138+는 확장 세부 설정의 Allow User Scripts, 이전 버전은 개발자 모드를 사용자가 켜야 한다. 확장 업데이트 때 재등록도 필요하다. [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts) | 선택자 문자열을 담은 JS로 스타일을 만드는 우회는 가능하다. 그러나 추가 권한·사용자 설정·등록/해제/업데이트 동기화가 필요하고, 현재 Chrome 최소 버전 116과도 맞지 않는다. 이번 제약에서는 제외한다. |
| Firefox `scripting.registerContentScripts` | Firefox 102+에서 MV2도 지원한다. CSS는 파일 목록이고 Firefox에서는 `runAt`이 CSS 삽입 시점에도 영향을 준다. [Mozilla 등록 API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/registerContentScripts), [등록 타입](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/RegisteredContentScript) | Chrome의 문자열 CSS 등록 문제를 해결하는 공통 수단이 아니다. |
| Firefox `contentScripts.register` | `css: [{code: ...}]`를 받을 수 있다. 등록한 확장 페이지가 내려가면 등록도 해제되므로 그 페이지의 수명을 고려해야 한다. Chrome에는 이 API가 없다. [Mozilla contentScripts.register](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contentScripts/register), [Mozilla 호환성 원본](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/contentScripts.json) | Firefox 전용 대안이지만 브라우저 재시작 시 저장소를 읽고 다시 등록하는 시작 구간이 남는다. Chrome과 별도 수명·OFF·복원 관리를 추가할 이유가 이번에는 부족하다. |
| Firefox의 새 `userScripts` | Firefox 136+의 새 API는 MV3 전용이다. `userScripts`는 선택 권한으로 요청해야 한다. MV2의 구 API는 호환되지 않는다. [Mozilla userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts), [Mozilla 호환성 원본](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/userScripts.json) | 현재 Firefox MV2 산출물에 Chrome용 구현을 그대로 적용할 수 없다. |

**사실:** 현재 설정은 Chrome 최소 116, `storage`·`activeTab`·`webNavigation`·`scripting`을 사용한다. 조사 때 존재하던 산출물은 Chrome MV3와 Firefox MV2였고, 둘 다 일반 콘텐츠 스크립트(content script)의 `run_at`은 생략하고 preload만 `document_start`로 등록했다. 산출물은 새로 만들지 않았으므로 최신 코드와의 일치 검증은 별도다. [설정](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/wxt.config.ts:22), [Chrome manifest](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/dist/chrome-mv3/manifest.json), [Firefox manifest](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/dist/firefox-mv2/manifest.json)

**사실:** 확장 저장소는 비동기이며 완료에 시간이 걸릴 수 있다. `storage.session`도 같은 비동기 API를 사용한다. 페이지의 `localStorage`로 옮기면 콘텐츠 스크립트가 호스트 페이지와 저장소를 공유하므로 확장 내부 데이터의 동기 대체재로 삼기 어렵다. [Chrome 저장소 문서](https://developer.chrome.com/docs/extensions/reference/api/storage#concepts_and_usage)

**추론:** 현재 권한과 양쪽 브라우저 지원을 유지하면서, 임의의 사용자별 CSS 문자열을 브라우저의 영속적인 첫 표시 전 CSS 슬롯에 넣는 공통 API는 확인하지 못했다. 서비스 워커의 메모리 캐시나 `storage.session`은 평균 지연을 줄일 수 있어도 새 문서에 동기적으로 규칙을 전달하는 보장은 만들지 못한다. 따라서 API 교체보다 현재 실패 처리와 복구 흐름 수정이 작다. [Chrome 저장소의 비동기 사전 로딩 설명](https://developer.chrome.com/docs/extensions/reference/api/storage#asynchronous_preload_from_storage)

## 2. 실제 소스에서 확인한 원인과 책임 경계

### 공개와 취소가 하나의 상태다

**사실:** `injectPreloadCSS`는 `:root, :root * { visibility: hidden !important; }`를 붙인다. `finish()`는 `finished = true`, 가림 제거, 모든 구독 해제를 함께 실행한다. 150ms 타이머도 `finish()`를 호출하며, 저장소 응답 뒤에는 `finished`와 `performance.now() >= deadline`을 모두 검사한다. 따라서 타임아웃 뒤 CSS가 성공해도 적용할 수 없다. CSS와 사이트 설정 읽기는 이미 함께 시작하므로 단순 병렬화는 새 해결책이 아니다. [preload.content.ts:23](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/preload.content.ts:23)

**사실:** `f485ab6`의 현재 코드는 해당 페이지 키와 사이트 키에서 파싱한 **선택자 집합**이 달라질 때만 대기 중 작업을 취소한다. 다른 사이트·경로·검색어, 순서·중복·수량만 바뀐 동등한 효과를 전체 캐시 변경으로 취소하지 않는다. 이 교정은 유지해야 한다. [변경 감지:47](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/preload.content.ts:47), [기존 회귀 시나리오:92](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:92)

**추론:** 150ms 뒤 **가림만** 제거하고 유효한 읽기는 살려 두면, 예를 들어 260ms에 읽기가 끝났을 때 그 시점부터 숨길 수 있다. 150~260ms 사이의 노출은 남지만 UI 준비나 일반 기록 조회가 더 늦을 때의 긴 노출을 줄인다. 정확한 감소량·발생 빈도는 아직 측정하지 않았다. 근거는 위 취소 분기이며, 260ms는 인계된 지연 조건이다.

### 일반 숨김이 UI 준비 뒤에 있다

**사실:** `bootstrap`은 로케일 초기화, 콘텐츠 스타일 로딩, 패널 준비, 사이트 설정 조회 뒤 `applyStoredHiding`을 호출한다. 조사 중 병행 UI 변경은 여기에 테마 초기화 대기도 추가했다. 이 변경을 덮어쓰지 말고 초기 숨김이 UI 준비를 기다리는 의존성만 분리해야 한다. 일반 진입점의 `runAt`은 지정되지 않았다. [content.ts의 bootstrap](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/content.ts:40)

**추론·권고:** 사이트 설정·수명/설정 변경 구독·기록 적용을 먼저 시작하고, 로케일·테마·패널은 별도로 준비한다. 숨김 적용은 기존 `applyHiddenElement(..., false)`를 쓰므로 숨김 자체를 위해 패널 CSS를 기다릴 필요는 없다. 다만 초기화 순서를 옮길 때 OFF 처리와 정리는 패널 생성 전에도 동작해야 하고, UI에서 `hidingEnabled`를 읽는 흐름도 유지해야 한다. 단순히 진입점 전체를 `document_start`로 옮기면 React/UI 준비까지 앞당기는 범위가 생긴다. 우선 기존 진입점 안의 대기를 제거하고 결과를 측정한다. 이것만으로 일반 숨김이 첫 표시 전으로 이동한다고 주장하지 않는다. [일반 숨김 함수](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/record-hide.ts:6), [DOM 숨김·복원](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/element-hide.ts:15), [Chrome 실행 시점](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#run_time)

### 선택자 검증은 삭제만 하고, 캐시 재적용에서는 검증도 하지 않는다

**사실:** `verifyAndCleanCSSSelectors`는 기존 선택자가 정확히 1개이며 다시 찾은 `el`과 같은지 검사한다. 다르면 현재 스타일 규칙과 `CSS_ALL_KEY`의 항목을 삭제한다. 새 선택자를 만들거나 DB의 `record.cssSelector`를 고치지 않는다. `backfillCSSSelector`는 반대로 `resolveCSSSelector`로 생성한 선택자를 캐시에 더한 뒤 `UPDATE_RECORD_CSS_SELECTOR`를 전송한다. 두 함수는 콘텐츠 쪽에서 전체 `CSS_ALL_KEY`를 각각 읽고 다시 쓴다. [검증·삭제:91](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/preload-css.ts:91), [보충 생성:45](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/preload-css.ts:45)

**사실:** `applyStoredHiding`은 선택자가 없거나 레거시 형식일 때만 보충 생성하고, 다른 경우는 검증·삭제만 한다. 기록 캐시가 있으면 `applyRecordsHiding(document, cached)` 후 바로 반환해 이 후처리 콜백도 호출하지 않는다. 감시자는 자식 추가·삭제만 관측하고 80ms 디바운스(debounce), 8초 수명을 사용한다. 따라서 첫 조회 때 없던 요소가 나중에 나타나면 숨김은 가능해도 선택자 보충·복구는 빠진다. 속성만 바뀌는 경우와 8초 뒤 생성은 별도 한계다. [watcher.ts:24](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:24), [감시 범위:70](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:70)

**사실:** 백그라운드의 `UPDATE_RECORD_CSS_SELECTOR`는 `withRecordMutation` 큐 안에서 DB의 선택자와 매칭 순서만 갱신한다. 현재 CSS 캐시는 이 경로에서 갱신하지 않는다. 복원·초기화는 같은 큐를 사용하고, `removeManagedRecords`는 살아남을 DB 기록으로 해당 사이트 캐시를 다시 만든 뒤 삭제한다. 이어 `REFRESH_HIDING`이 DOM 스타일과 인라인 숨김을 정리한다. [기존 갱신 처리:188](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:188), [DB 갱신:71](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/repository.ts:71), [변경 큐와 복원 서비스](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/management-service.ts:12), [사이트 캐시 재구성:69](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/management-service.ts:69)

**추론:** 삭제 뒤 보충 생성 함수를 그대로 이어 부르기만 하면 안전한 자체 복구가 되지 않는다. 두 전체 캐시 쓰기 사이에 다른 탭의 추가·복원·초기화가 들어오면 잃어버린 업데이트나 삭제된 규칙의 부활이 가능하다. 또 DB는 오래된 선택자를 계속 보유하므로 다음 복원 시 사이트 캐시 재구성이 그 선택자를 다시 넣을 수 있다. 이 위험은 캐시 읽기/쓰기와 DB 갱신의 현재 분리에서 나온다. 위 세 소스가 근거다.

## 3. 추천하는 작은 설계 하나

### A. 150ms에는 공개하고, 실제 무효화에만 취소한다

**권고:** `reveal()`은 멱등적으로 전체 가림만 제거한다. `cancel()`은 대기 작업을 무효화하고 `reveal()`과 구독 정리를 수행한다. 타이머는 `reveal()`만 부르고, 성공·실패·OFF·빈 캐시가 확정되면 각각 필요한 종료 처리를 한다. 늦은 CSS를 적용한 뒤 종료한다. 타임아웃만으로 `finished`를 세우거나 `deadline`을 적용 금지 조건으로 쓰지 않는다. 근거가 되는 현재 결합 지점은 [preload.content.ts:33](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/preload.content.ts:33)이다.

**필수 조건:** 공개 후에도 읽기가 끝나기 전에는 사이트 설정·관련 선택자 집합 변경·`pagehide`·WXT 무효화 구독이 살아 있어야 한다. CSS 주입 직전에도 취소 여부, `ctx.isInvalid`, 대상 URL, 기존 `__veil_preload__` 존재를 확인한다. 공개 후 설정 변경이 오면 그 작업은 영구 취소하고, 이후 ON 처리는 일반 숨김 흐름에 맡기는 것이 작고 안전하다. 빈 CSS·오류에는 페이지를 즉시 공개하고, 늦은 설정 응답을 기다린다는 이유로 다시 가리지 않는다. [현재 가드·구독](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/preload.content.ts:61), [WXT 수명 관리](https://wxt.dev/guide/essentials/content-scripts.html#context)

| 경쟁조건 | 구현에서 지킬 조건 |
| --- | --- |
| CSS 또는 설정 읽기가 150ms 초과 | 150ms 예산으로 공개하고, 두 값이 유효하게 확인되면 늦게라도 적용한다. 오류·무응답으로 페이지가 계속 가려지지 않는다. |
| 공개 후 OFF, OFF→ON | 대기 중 사전 작업은 취소 상태를 유지한다. 오래된 ON 응답을 받아 재적용하지 않는다. ON 이후 재적용은 최신 일반 경로가 담당한다. |
| 복원·초기화·현재 규칙 교체 | 관련 선택자 집합 변화로 이전 스냅샷을 취소한다. 초기화 응답·DOM 복원 뒤 늦은 CSS가 다시 붙지 않아야 한다. |
| 다른 사이트/페이지/검색어 변경, 동등한 집합 | `f485ab6`의 효과 비교를 유지해 취소하지 않는다. |
| 실제 문서 이탈·확장 무효화 | 가림과 구독을 정리하고 뒤늦은 DOM 쓰기를 금지한다. |
| 같은 문서 탐색 | 최종 URL 비교만으로 `/a → /b → /a`를 검출할 수는 없다. 이미 있는 탐색 경로와 연결해 한 번 이탈한 작업을 취소하는 시나리오까지 확인한다. 두 콘텐츠 번들의 모듈 전역 변수를 공유한다고 가정하지 않는다. |

이 표는 **권고하는 동작 계약**이며 현재 충족됐다는 판정이 아니다. 특히 일반 `recordGeneration`은 `watcher.ts` 내부 상태이고 preload가 이를 읽는 경로는 없다. 현재 탐색 처리는 [setupNavigationListener](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:93), [onSpaNavigation](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/content.ts:186)에 있다.

**추론·주의:** 별도의 SPA 경로인 백그라운드 `webNavigation.onHistoryStateUpdated`도 저장소를 읽어 `__veil_preload__`를 덮어쓴다. 현재 콜백에는 사이트 OFF 조회나 주입 직전 대상 URL 재검증이 없다. 초기 preload만 고치고 모든 탐색 경쟁조건을 해결했다고 보고하면 안 된다. 이 경로가 검증에 개입하면 기존 콜백에 설정·문서/URL 유효성 검사를 좁게 보강하거나, 이미 있는 콘텐츠 탐색 흐름으로 책임을 모으는 선택이 필요하다. 전체 SPA 구조 재작성까지 권하지 않는다. [background.ts:96](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:96)

**한계:** 150ms는 예약한 공개 예산이다. CPU 부하나 긴 작업이 있으면 타이머 실행 자체가 늦어지므로 실제 가림 시간이 항상 150ms 이하라는 실시간 보장은 없다. 이번 변경은 추가 대기나 새 가림을 넣지 않는 것으로 정의한다. [HTML 타이머 사양](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)

### B. 일반 숨김을 UI 대기에서 앞당긴다

**권고:** 기존 `bootstrap` 안의 초기 숨김 수명·설정 구독과 적용을 UI 대기와 독립시킨다. OFF·무효화 때 현재 세대(generation)를 무효화하는 동작은 초기 숨김 시작보다 먼저 준비한다. 패널을 아직 만들지 않은 상태에서 이벤트가 와도 예외가 없어야 한다. 기존 로케일·테마·패널 코드는 보존한다. 이는 위 A에서 캐시가 불일치하거나 비어 있는 경우의 복구 시작을 앞당기는 보완이다. [bootstrap](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/content.ts:40), [기록 세대 검사](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:19)

### C. 다시 찾은 요소의 선택자 교체를 기존 변경 큐에서 마친다

**권고 흐름:** 일반 매칭이 성공한 요소에서 기존 선택자를 검증한다. 맞지 않으면 현재 DOM 규칙을 먼저 제거하고 `resolveCSSSelector(el, document)`를 재사용한다. 생성 결과는 지금 이 요소 하나만 가리키는지, 연결된 요소인지, 숨김 제외 대상이 아닌지 확인한다. 새 선택자를 만들지 못하면 더 넓은 선택자를 임의로 만들지 않는다. 기존 선택자의 무효화와 선택자 없는 기록 보존을 같은 저장 경로로 처리한다. 저장 스키마의 `cssSelector`는 이미 선택 필드다. [생성 함수](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/derivation/record-match-signal-derivation.ts:244), [유일성 확인:378](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/derivation/record-match-signal-derivation.ts:378), [제외 정책](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/hide-policy.ts:7), [스키마](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/schema.ts:105)

**저장 책임:** `UPDATE_RECORD_CSS_SELECTOR`를 확장·재사용하고 `withRecordMutation` 안에서 현재 기록을 다시 읽는다. 이미 삭제된 기록은 아무것도 쓰지 않는다. 전송 당시의 이전 선택자도 비교하면 다른 탭이 먼저 갱신한 뒤 도착한 오래된 복구 요청을 버릴 수 있다. 현재 메시지는 fire-and-forget이므로 실제 완료를 확인해야 하는 복구에는 기존 `portRequest`/`msgId` 응답 방식을 재사용한다. 메시지 입력과 송신 프레임/사이트 검증은 이 변경 범위에서도 필요하며, 관리 메시지에서 이미 사용하는 검증 경계를 약화하지 않는다. [기존 포트 타입·처리](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:26), [요청·응답 유틸리티](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/content-port.ts:5), [관리 대상 검증](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:197)

**캐시 동기화:** 해당 사이트의 살아 있는 기록들로 CSS 항목을 다시 구성하는 기존 `removeManagedRecords`의 방식을 재사용한다. 필요하면 그 구성 부분만 작은 내부 함수로 분리한다. 다른 사이트 캐시는 보존한다. 단순히 이전 선택자 문자열을 전역 삭제하면 같은 선택자를 쓰는 다른 기록까지 지울 수 있다. 콘텐츠 쪽의 `CSS_ALL_KEY` 직접 읽기-수정-쓰기는 이 복구 경로에서 제거하고, 기존 보충 생성 경로도 같은 백그라운드 저장을 사용해야 큐 밖 쓰기가 남지 않는다. [기존 캐시 재구성·실패 복구](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/management-service.ts:69), [보충 생성의 직접 쓰기](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/preload-css.ts:68)

**실패 조건:** DB와 `storage.local`은 하나의 원자적 트랜잭션이 아니다. 기존 복원 서비스처럼 쓰기 순서·실패 시 되돌리기를 명시해야 한다. 캐시만 새 값이고 DB는 옛 값인 상태를 완료로 보고하지 않는다. CSS 캐시 쓰기 실패나 DB 갱신 실패는 응답으로 전달하고, 현재 문서에서 이미 올바르게 적용한 인라인 숨김은 유지하면서 복구 실패를 처리한다. 일반 매칭까지 실패로 되돌릴 이유는 없다. 서비스 워커가 두 저장 사이에서 종료되는 경우의 완전한 원자성은 별도 저널 없이 보장하지 못한다. 이번에는 저널·스키마 변경을 권하지 않는다. [기존 실패 보상 구현](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/management-service.ts:86)

**동적 DOM:** `applyStoredHiding`의 캐시 적중/미적중 경로가 같은 매칭 후처리를 거쳐야 한다. 처음에는 요소가 없어 매칭되지 않았다가 감시 중 나타난 경우도 복구한다. 복구 성공 후 메모리의 기록도 새 선택자를 사용하게 하고, 실패한 비동기 후처리의 거절을 방치하지 않는다. OFF·복원·탐색 뒤 이전 후처리가 DOM에 쓰지 않도록 기존 세대 검사 범위를 보존한다. 새 무한 감시자나 모든 속성 감시를 이번에 추가하지 않는다. [현재 조기 반환과 후처리](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:24)

## 4. 매칭 안전성과 첫 방문의 한계

**사실:** 현재 `matchByCSSSelector`는 선택자가 하나를 가리키면 그 요소를 바로 신뢰한다. 기록 생성 시 CSS 전략이 앞에 놓인다. 구조 매칭도 후보가 하나면 바로 채택하며, 여러 후보일 때는 점수 동률을 제외하고 최고 후보를 고른다. 따라서 현재 코드는 의미상 동일한 요소임을 완전히 증명하지 않는다. 또한 사전 CSS는 `selector{display:none!important}`를 만들어 매칭되는 모든 요소에 적용하므로 일반 매칭의 유일성 검사조차 거치지 않는다. [기록 매칭](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/match/record-match-resolver.ts:10), [기록 생성 시 매칭 순서](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/derivation/record-input-derivation.ts:47), [구조 후보 점수](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/match/tree-candidate-resolver.ts:50), [사전 CSS 생성](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/css-cache.ts:33)

**추론:** 자체 복구는 기존 선택자가 0개·여러 개·문법 오류여서 다른 전략으로 요소를 다시 찾은 경우에 효과가 있다. 옛 선택자가 우연히 다른 요소 하나를 가리키면 CSS 전략이 그 요소를 반환하고 검증도 같은 요소라 통과하므로 이번 작은 복구만으로 잡지 못한다. 이 경우를 해결하려면 독립된 속성·앵커·구조 신호로 CSS 후보를 교차 검증하는 별도 매칭 정책이 필요하다. 근거 없이 매칭 문턱을 낮추거나 첫 후보를 저장하는 변경은 제외한다. 위 소스의 한계이며 현재 네이버에서 이 오매칭이 발생했다는 뜻은 아니다.

**사실·한계:** 모든 전략에서 요소를 찾지 못하면 `applyRecordsHiding`은 후처리 콜백을 부르지 않는다. 아직 등장하지 않은 동적 요소와 영구히 사라진 요소를 즉시 구분할 수도 없다. 따라서 복구 보장은 **다른 기존 전략으로 실제 요소를 다시 찾고, 새 선택자를 안전하게 생성·저장한 기록**에 한정한다. 매칭 실패만으로 기록을 삭제하거나 선택자를 임의 재생성하지 않는다. [매칭 실패 처리](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/record-hide.ts:11)

**복원 계약:** 정확히 찾은 요소의 현재 숨김은 기존 인라인 스타일 보존·`inert` 추가 추적·복원을 사용한다. 사전 CSS만 남으면 인라인 복원으로는 다시 표시되지 않으므로 개별 복원/전체 초기화/OFF에서 DOM 사전 규칙과 저장된 캐시까지 함께 정리하는 흐름을 유지한다. 늦은 주입과 복구 저장이 이 정리를 되돌리지 않아야 한다. OFF는 기록 삭제가 아니므로 DB의 유효한 선택자 복구와 현재 문서 재숨김을 구분하되, 초기화는 기록과 캐시를 다시 만들면 안 된다. [요소 숨김·복원](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/element-hide.ts:69), [refreshHiding](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/content.ts:212), [사이트 설정 저장](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/hiding-preference/storage.ts:30)

**보장할 수 없는 것:** 아직 모르는 새 구조에 맞는 선택자를 첫 표시 전에 미리 알 수는 없다. 150ms 뒤 공개해야 하고 규칙 읽기나 요소 등장도 더 늦을 수 있으므로, 가림 시간을 늘리지 않는 조건에서 모든 첫 방문의 노출 0회는 보장할 수 없다. 복구된 다음 방문도 구조가 다시 바뀌지 않고, 읽기가 공개 전에 끝나며, CSS가 실제 대상에 일치하는 조건에서 기대할 수 있다. rAF 관측 0회는 측정한 프레임과 조건에 대한 증거이며 모든 실제 표시 프레임·사이트의 영구 보장은 아니다. [Chrome 실행 시점](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#run_time), [저장소 지연](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_and_throttling_limits), [현재 프레임 관측 방식](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:320)

## 5. 변경할 실제 함수와 호출자

다음은 **후속 설계·구현의 예상 범위**다. 이 조사에서 수정한 파일 목록이 아니다.

| 위치 | 필요한 변경과 연결되는 호출자 |
| --- | --- |
| [preload.content.ts `injectPreloadCSS`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/preload.content.ts:23) | 공개/취소 분리, 늦은 읽기 생존, 관련 변경만 취소하는 비교 보존, 종료/탐색 가드. `main`이 유일한 직접 호출자다. |
| [content.ts `bootstrap`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/content.ts:40) | UI와 초기 숨김 시작 순서 분리. OFF 구독, `refreshHiding`, `onSpaNavigation`, BFCache의 `pageshow`, 무효화 정리가 영향을 받는다. 병행 로케일·테마·패널 변경 보존. |
| [watcher.ts `applyStoredHiding`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/watcher.ts:24) | 캐시 적중에도 매칭 후처리. 초기 적용·설정 ON·탐색·복원·돌아오기·변이 감시의 모든 호출에서 같은 세대 검사 유지. |
| [preload-css.ts `backfillCSSSelector`, `verifyAndCleanCSSSelectors`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/element-hiding/preload-css.ts:45) | 생성과 검증 재사용, 오래된 선택자의 교체/무효화 요청. 전체 저장소 캐시 직접 쓰기를 기존 백그라운드 메시지로 옮긴다. 호출자는 `applyStoredHiding`이다. |
| [background.ts `UPDATE_RECORD_CSS_SELECTOR`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:188) | 기존 변경 큐에서 기록 존재/기대값·송신 대상 검증, DB+캐시 갱신, 완료/실패 응답. `ADD_RECORD`·`DELETE_RECORD`·관리 복원 큐와 경쟁을 확인한다. |
| [repository.ts `updateRecordCSSSelector`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/repository.ts:71), [management-service.ts 캐시 구성](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/features/record/management-service.ts:69) | 기존 저장 책임에 맞춘 작은 서비스 보완. 미존재 기록 무시, 현재 기록만 재구성, 실패 보상. 선택자 제거가 필요하면 기존 선택 필드를 사용한다. |
| [background.ts `onHistoryStateUpdated`](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/src/entries/background.ts:96) | 초기 경로와 별개인 늦은 CSS 작성자다. OFF·연속 탐색 검증에서 필요한 최소 가드를 포함하고 별도 미검증 영역으로 숨기지 않는다. |
| [verify-preload.ts](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:92) 및 기존 패널 검증 | timeout의 기존 “CSS가 절대 붙지 않음” 기대를 새 계약으로 변경한다. 정상 지연과 무효화 지연을 나누고, DB까지 포함하는 복구→다음 방문 검증을 추가한다. UI/README/package의 타 작업 변경은 보존한다. |

기존 생성 함수·매칭 전략·`portRequest`·변경 큐·사이트 캐시 구성 방식을 사용한다. 새 일반 캐시 프레임워크, 저장소 마이그레이션, 브라우저별 두 번째 규칙 시스템은 이번 문제 해결 범위를 넘는다.

## 6. 검증 시나리오와 완료 기준

아래는 **실행할 검증 계획**이다. 이 조사에서 통과했다는 뜻이 아니다. 기존 preload 스크립트는 실제 Chrome API를 사용하면서 응답 반환을 지연시키고, 임시 확장 복사본과 프로필을 사용한다. 시뮬레이션한 지연과 네이티브 저장소 동작을 구분해 결과에 적는다. [임시 복사·프로필](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:38), [응답 계측](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/scripts/verify-preload.ts:233)

| 시나리오 | 확인할 결과 |
| --- | --- |
| 정상 캐시·정상 설정 | CSS가 공개/FCP 이전, 페이지 첫 공개 프레임부터 대상 숨김. 다른 콘텐츠는 정상 표시. |
| CSS 260ms 지연 / 설정 260ms 지연 / 둘 다 지연 | 기존 150ms 예산으로 공개. 약 260ms의 실제 완료 뒤 CSS 적용. 가림 재부착·추가 전역 대기 없음. 타이머 허용 오차는 환경과 함께 보고. |
| 빈 캐시 / OFF / 저장소 거절 / 영원히 미완료 | 빈 값·OFF·실패가 확인되면 조기 공개, 무응답도 타이머로 공개. 읽기 순서가 바뀌어도 다시 가리지 않음. |
| 공개 후 늦은 완료 직전에 OFF, OFF→ON, reset, 개별 복원, 규칙 교체/삭제 | 이전 CSS가 붙거나 복원한 요소가 재숨김되지 않음. ON 이후에는 최신 일반 적용만 허용. |
| 다른 사이트·페이지·검색어 / 동일 효과의 순서·중복·수량 변화 | `f485ab6` 회귀 없이 현재 페이지의 늦은 유효 CSS 적용. |
| `pagehide`, WXT 무효화, 새 문서 이동, SPA `/a→b`, `/a→b→a` | 이전 작업의 DOM 쓰기 없음. 백그라운드 SPA 주입 경로도 함께 검사. BFCache 복귀는 별도 기존 `pageshow` 동작 확인. |
| 문법상 유효한 `#old-target` 0개, 다른 신호로 실제 요소 하나 복구 | 현재 문서에서 실제 대상만 숨김. DB 선택자와 사이트/페이지 CSS 캐시가 같은 새 선택자로 갱신됨. 다음 방문의 정상 저장소 읽기에서는 새 CSS가 공개 전에 대상에 일치. |
| 선택자 문법 오류 / 여러 요소 일치 / 선택자 생성 불가 | 예외로 부트스트랩 중단 없음. 넓은 선택자로 보정하지 않음. 무효화와 일반 숨김을 구분하고 다른 기록의 공유 선택자를 잃지 않음. |
| 옛 선택자가 다른 요소 하나에 일치 | 현행 매칭 안전성 한계를 드러내는 별도 fixture. 자체 복구가 해결한 경우로 보고하지 않음. 교차 검증을 추가했다면 원래 요소와 잘못된 요소를 각각 확인. |
| 최초 조회 후 80ms 이상 지나 요소 추가 | 기록 캐시 적중 경로에서도 숨김과 선택자 복구 수행. 두 번째 방문까지 재검증. 속성만 변경·8초 뒤 생성은 별도 미지원 조건으로 보고. |
| 복구 요청과 다른 탭 추가·복원·reset 동시 실행 | 다른 사이트/기록 손실 없음. reset 후 DB·캐시 부활 없음. 두 기록이 같은 선택자를 공유하는 경우도 보존. |
| 캐시 쓰기 실패 / DB 쓰기 실패 / 응답 끊김 | 성공을 거짓 보고하지 않음. 기존 실패 보상 유지, 다른 기록 손상 없음. 현재의 올바른 인라인 숨김은 유지. |
| 숨김·미리보기·복원 반복 | 원래 인라인 스타일, 원래 `inert`, 초점/접근성, 패널 제외 정책 보존. 사전 CSS만 남아 복원 실패하는 상태 없음. |
| 실제 Chrome 네이버 | 현재 선택자별 일치 개수 확인 후 새로고침·강력 새로고침·다른 페이지에서 재진입을 각각 반복. 첫 5초 대상별 rAF 노출, CSS 삽입, 공개 시점 기록. 변경 전후 같은 조건을 비교하고 UI도 실제로 확인. |

구현 완료 시 `pnpm lint:types`, 변경 범위 lint/포맷, `pnpm zip`, 갱신한 `pnpm verify:preload --chromium <Chrome>`와 관련 패널 복원 검증을 실행한다. 실제 Chrome 네이버 확인은 패키징·로컬 fixture와 별도로 보고한다. Firefox 빌드/API fixture를 검사해도 Firefox 실제 실행 검증으로 적지 않는다. 명령과 기존 교정 검증 연결은 [package.json](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/package.json), [README 검증 지도](/Users/jeongmin-yeong/Developer.localized/bolerish/veil/README.md:38)에 있다.

## 남는 한계와 후속 설계에 넘길 결정

**확인한 한계:** 기존 CSS 우선 매칭은 잘못된 단일 요소와 의미상 동일한 요소를 구분하지 못한다. 감시자는 자식 변이만 8초 관측한다. 두 저장소 사이의 강제 종료 원자성도 없다. 이 보고서의 권고는 이 제약을 숨기거나 전체 매칭/감시/저장 아키텍처를 재작성하지 않는다. 관련 소스는 2~4절에 연결했다.

**미확인:** 제안 구현의 실제 노출 감소량, 병행 UI 초기화와의 상호작용, 브라우저 콜드 스타트·CPU 부하·큰 캐시·Firefox 런타임 결과는 측정하지 않았다. 네이버의 인계된 성공 결과만으로 이 조건들을 통과했다고 볼 수 없다.

후속 pstack 설계에서는 공개/취소 상태와 종료 조건, 초기 숨김의 UI 독립 시작 위치, 기존 선택자 갱신 메시지의 완료 응답·무효화 표현·실패 보상을 확정하면 된다. 완료 기준은 **추가 전역 가림 없이 늦은 유효 CSS 적용, 사용자 OFF/복원/초기화 보존, 선택자 불일치 복구 후 다음 방문 캐시 회복을 실제로 검증하는 것**이다.
