# Arcane GI Labyrinth 최종 과제 보고서

## 1. 프로젝트 개요

본 프로젝트는 Three.js를 이용해 제작한 3인칭 중세 던전 액션 퍼즐 게임이다. 플레이어는 궁수 캐릭터를 조작하여 세 개의 방을 순서대로 통과한다. 각 방은 서로 다른 게임 규칙을 가지고 있으며, 불화살, 경비병 전투, 룬 기억 퍼즐, 유리 다리 판별 기믹을 통해 최종 목표에 도달하도록 구성하였다.

![게임 시작 화면](images/01_start_room1.png)

- 프로젝트명: Arcane GI Labyrinth
- 장르: 3D 액션 퍼즐 게임
- 사용 기술: Three.js, GLTFLoader, FBXLoader, Mixamo animation, JavaScript
- GI 기술: Surfel GI 스타일의 표면 기반 동적 간접광 연출
- 실행 방식: GitHub Pages 또는 웹 배포 링크 접속

## 2. 게임 기획

게임은 Room 1, Room 2, Room 3의 순서로 진행된다. 각 방은 단순히 다음 문으로 이동하는 방식이 아니라, 방마다 다른 목표를 해결해야 문이 열리도록 설계하였다. 이를 통해 채점 기준 중 기획 요소를 강화하고, 플레이어가 각 공간에서 다른 방식의 상호작용을 경험하도록 구성하였다.

![전체 맵 진행 구조](images/02_map_overview.png)

### 2.1 Room 1: 불화살 점화 퍼즐

Room 1에서는 세 개의 돌기둥에 불화살을 맞혀 불을 붙여야 한다. 세 돌기둥이 모두 점화되면 Room 2로 향하는 문이 열린다. 이 방은 불화살과 환경 오브젝트의 상호작용을 보여주는 첫 번째 퍼즐 구간이다.

![Room 1 목표 안내](images/03_room1_objective.png)

![돌기둥 점화 장면](images/04_room1_pillar_ignite.png)

### 2.2 Room 2: 경비병 전투와 룬 기억 퍼즐

Room 2에서는 세 명의 Paladin 경비병을 처치해야 한다. 경비병이 죽으면 그 위치 위에 룬 문자가 홀로그램처럼 떠오른다. 플레이어는 룬이 나타난 순서를 기억한 뒤 문 앞에서 비밀번호를 입력해야 Room 3으로 이동할 수 있다.

![Room 2 경비병 전투](images/05_room2_combat.png)

![경비병 사망 후 공중 룬 표시](images/06_room2_rune_hologram.png)

![Door B 룬 입력 창](images/07_room2_password_modal.png)

### 2.3 Room 3: 강화유리 판별 다리

Room 3은 오징어게임식 2지선다 유리 다리 구조로 구성하였다. 각 단계에는 좌우 두 장의 유리가 있고, 하나는 강화유리, 하나는 일반 유리이다. 플레이어는 제한된 화살로 유리를 먼저 쏘아 확인한 뒤 안전한 경로로 건너야 한다. 일반 유리는 화살에 맞거나 플레이어가 밟으면 깨지며, 플레이어가 추락하면 사망한다.

![Room 3 유리 다리](images/08_room3_glass_bridge.png)

![화살로 유리 확인](images/09_room3_arrow_test.png)

![일반 유리 파괴 및 추락](images/10_room3_glass_break.png)

![강화유리 통과 성공](images/11_room3_clear.png)

## 3. 강의 내용과 구현 내용 매핑

본 프로젝트는 강의에서 다룬 3D 그래픽스의 주요 요소를 게임 기능과 연결하여 구현하였다.

| 강의 내용 | 게임 구현 내용 | 캡쳐 |
| --- | --- | --- |
| Scene, Camera, Renderer | Three.js Scene 구성, 3인칭 PerspectiveCamera, WebGLRenderer 사용 | `images/01_start_room1.png` |
| Geometry | 벽, 바닥, 기둥, 문, 유리 다리, 화살, 활 오브젝트 구현 | `images/02_map_overview.png` |
| Material / Texture | 벽돌 느낌의 벽/바닥 텍스처, 유리 투명 재질, 불꽃 emissive 계열 표현 | `images/12_wall_floor_texture.png` |
| Lighting | HemisphereLight, DirectionalLight, torch PointLight, 불화살 PointLight 사용 | `images/13_lighting_fire_arrow.png` |
| Animation | Mixamo 궁수 모델, Paladin FBX animation, 공격/피격/사망 모션 적용 | `images/14_animation_paladin_attack.png` |
| Collision | 벽, 문, 유리, 적, 화살 충돌 판정 구현 | `images/15_collision_arrow_hit.png` |
| Interaction | F 키 문 상호작용, 퍼즐 모달, 화살 발사, 점프, HP 시스템 | `images/16_ui_interaction.png` |
| GI 기술 | 불화살이 표면에 박힌 위치에 동적 조명을 남기는 Surfel GI 스타일 연출 | `images/17_surfel_gi_stuck_arrow.png` |

## 4. GI 기술 적용: Surfel GI 스타일 구현

본 프로젝트에서는 DDGI가 아니라 Surfel GI 스타일의 근사 기법을 적용하였다. DDGI는 일반적으로 3D 공간에 probe grid를 배치하고 각 probe가 주변 조명 정보를 저장하여 간접광을 계산하는 방식이다. 반면 본 프로젝트는 불화살이 벽, 바닥, 오브젝트 표면에 충돌했을 때 그 표면 위치에 작은 동적 PointLight를 남긴다. 이 방식은 실제 Surfel GI처럼 표면 지점이 간접 조명의 기여점처럼 작동하는 형태로 연출된다.

![불화살 충돌 전 어두운 공간](images/17a_before_surfel_light.png)

![불화살 충돌 후 표면 주변이 밝아지는 장면](images/17b_after_surfel_light.png)

구현 방식은 다음과 같다.

- 플레이어가 불화살을 발사하면 화살 오브젝트와 PointLight가 함께 생성된다.
- 화살이 벽, 바닥, 타겟, 유리 또는 오브젝트에 충돌하면 이동 중이던 화살은 멈춘다.
- 벽/바닥/타겟 등에 박힌 화살은 일정 시간 동안 작은 광원으로 남는다.
- 이 광원은 주변 벽과 바닥을 비추며, 불화살이 표면에 남긴 간접광처럼 보이게 한다.
- 오래된 불화살 광원은 성능을 위해 제한된 개수만 유지한다.

![여러 불화살 광원이 공간을 밝히는 장면](images/18_multiple_surfel_lights.png)

이 기법은 완전한 물리 기반 GI는 아니지만, 게임 내에서 표면에 박힌 불화살이 주변을 밝히는 효과를 통해 Surfel GI의 핵심 개념인 “표면 기반 조명 기여”를 시각적으로 확인할 수 있도록 설계하였다.

## 5. 구현 상세 설명

### 5.1 맵 구조

맵은 문자열 배열을 기반으로 구성하였다. 각 문자는 벽, 바닥, 문, 장애물, 유리, 공허, 오브젝트 배치를 의미한다. 이 방식은 방 구조를 빠르게 수정할 수 있고, Room 1, Room 2, Room 3의 기믹을 명확하게 분리할 수 있다는 장점이 있다.

![문자열 맵 기반 방 구성](images/19_map_layout.png)

### 5.2 플레이어 시스템

플레이어는 3인칭 카메라로 조작한다. WASD 이동, Shift 달리기, Space 점프, 마우스 조준 및 좌클릭 화살 발사를 지원한다. HP는 5칸으로 구성하였고, Paladin의 검 공격에 맞으면 HP가 감소한다. HP가 모두 감소하면 궁수 사망 애니메이션이 재생되고, 이후 You Died 화면과 Regame 버튼이 표시된다.

![플레이어 HP 및 화살 UI](images/20_player_hp_arrows.png)

![플레이어 사망 화면](images/21_player_death.png)

### 5.3 화살 시스템

화살은 포물선 운동을 하도록 구현하였다. 중력값을 적용해 시간이 지날수록 아래로 떨어지고, 벽, 바닥, 적, 유리, 퍼즐 오브젝트와 충돌한다. Room 3에서는 화살 개수를 제한하여 유리 판별에 전략성이 생기도록 하였다.

![화살 궤적 미리보기](images/22_arrow_trajectory.png)

![화살이 오브젝트에 충돌하는 장면](images/23_arrow_collision.png)

### 5.4 Paladin AI

Paladin 경비병은 방 단위로 작동한다. 플레이어가 같은 방에 있을 때만 추적하고 공격하며, 플레이어가 다른 방으로 이동하면 추적을 중단하고 자기 위치로 돌아간다. 공격 모션 중에는 이동을 멈추고 검을 휘두른다. 공격 판정은 실제 검 위치와 플레이어의 거리, 방향을 이용해 계산하여 플레이어가 피하면 HP가 줄지 않도록 하였다.

![Paladin 추적 장면](images/24_paladin_chase.png)

![Paladin 검 공격 장면](images/25_paladin_attack.png)

![Paladin 사망 애니메이션](images/26_paladin_death.png)

### 5.5 문과 UI

문 앞에 가까이 가면 `Press F to go through` UI가 표시된다. Room 1과 Room 2의 문은 퍼즐 조건이 해결되어야 열리고, 조건이 충족되지 않으면 안내 모달 또는 메시지가 출력된다.

![문 앞 F 안내 UI](images/27_door_prompt.png)

![문 열림 장면](images/28_door_open.png)

### 5.6 Room 1 퍼즐 구현

Room 1의 세 돌기둥은 각각 불화살 충돌을 감지한다. 불화살이 돌기둥에 맞으면 기둥 위에 불꽃과 조명이 생성된다. 세 기둥이 모두 점화되면 Room 2 문이 자동으로 열린다.

![Room 1 돌기둥 세 개](images/29_room1_three_pillars.png)

![세 기둥 점화 후 문 열림](images/30_room1_door_open.png)

### 5.7 Room 2 룬 퍼즐 구현

Room 2의 세 경비병은 각각 룬 문자를 가지고 있다. 경비병이 죽으면 바닥이 아니라 공중에 홀로그램처럼 룬이 표시되도록 하였다. 이는 시체와 룬이 겹쳐 보이지 않는 문제를 해결하기 위한 개선이다.

![공중 룬 홀로그램](images/31_room2_hologram_detail.png)

![룬 순서 입력](images/32_room2_rune_input.png)

### 5.8 Room 3 유리 다리 구현

Room 3은 `G` 유리 타일과 `V` 공허 타일을 기반으로 구성하였다. 각 단계마다 좌우 두 칸 중 하나만 안전하다. 유리 타일은 투명 재질로 표현하고, 화살로 맞히면 일반 유리는 깨지고 강화유리는 색이 변하며 유지된다. 플레이어가 일반 유리에 착지하면 유리가 깨지고, 짧은 추락 연출 후 사망 화면이 표시된다.

![Room 3 유리 타일](images/33_room3_glass_tiles.png)

![일반 유리 파괴](images/34_room3_weak_glass.png)

![추락 연출](images/35_room3_fall.png)

## 6. 완성도 및 개선 사항

완성도 측면에서 다음 요소를 구현하였다.

- 3개의 방으로 구성된 명확한 게임 진행 구조
- 각 방마다 다른 목표와 퍼즐
- 3인칭 플레이어 조작
- Mixamo 기반 플레이어 모델 및 애니메이션
- Paladin 적 AI 및 전투 시스템
- HP, 화살 개수, 문 안내, 방 목표 UI
- Room 3 유리 다리 최종 스테이지
- Surfel GI 스타일 불화살 조명 연출
- 게임 오버 및 승리 화면

![승리 화면](images/36_victory.png)

아쉬운 점은 실제 물리 기반 GI 또는 정교한 pathfinding까지 구현하지는 못했다는 것이다. 대신 과제의 범위 안에서 시각적으로 확인 가능한 GI 연출과 방 단위 AI, 퍼즐 구조를 우선하였다.

## 7. 실행 방법

로컬에서 실행하는 방법은 다음과 같다.

```bash
npm install
npm run dev
```

브라우저에서 출력된 로컬 주소 또는 제출한 웹 배포 링크로 접속한다.

![웹 실행 화면](images/37_web_run.png)

## 8. 제출 링크

- GitHub Repository: `여기에 GitHub 저장소 링크 입력`
- Web 실행 링크: `여기에 GitHub Pages 또는 배포 링크 입력`
- Report MD 링크: `여기에 REPORT.md가 열리는 GitHub 링크 입력`

## 9. 결론

본 프로젝트는 Three.js 기반 3D 게임으로, 강의에서 배운 장면 구성, 모델링, 텍스처, 조명, 애니메이션, 충돌 처리, UI, GI 개념을 하나의 게임 플레이 흐름 안에 통합하였다. 특히 불화살이 표면에 박혀 주변을 밝히는 Surfel GI 스타일의 조명 연출을 통해 게임 기능과 GI 기술을 연결하였다. 또한 Room 1, Room 2, Room 3에 서로 다른 퍼즐과 전투 요소를 배치하여 단순한 데모가 아니라 완성된 게임 구조를 갖추도록 구현하였다.

![최종 게임 대표 이미지](images/38_final_overview.png)
