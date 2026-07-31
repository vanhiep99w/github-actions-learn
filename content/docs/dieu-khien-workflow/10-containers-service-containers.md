---
title: "Containers và service containers"
description: "Chạy job trong môi trường container tái lập được và kết nối database, cache hoặc API phụ trợ đúng cách."
---

<Callout type="info" title="Phạm vi chương">
  Chương này mô tả cú pháp GitHub Actions hiện hành năm 2026. Job container và service container chỉ chạy trên Linux runner. Với GitHub-hosted runner, hãy chọn một Ubuntu runner; với self-hosted runner, máy Linux phải cài Docker.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Hai loại container trong một job](#hai-loại-container-trong-một-job)
  - [Job container](#job-container)
  - [Service container](#service-container)
  - [Vòng đời do runner quản lý](#vòng-đời-do-runner-quản-lý)
- [Cơ chế mạng](#cơ-chế-mạng)
  - [Job chạy trong container](#job-chạy-trong-container)
  - [Job chạy trực tiếp trên runner](#job-chạy-trực-tiếp-trên-runner)
  - [Chọn port cố định hay ngẫu nhiên](#chọn-port-cố-định-hay-ngẫu-nhiên)
- [Cú pháp cấu hình](#cú-pháp-cấu-hình)
  - [Cấu hình jobs container](#cấu-hình-jobs-container)
  - [Cấu hình jobs services](#cấu-hình-jobs-services)
  - [Health check và readiness](#health-check-và-readiness)
  - [Image từ registry riêng](#image-từ-registry-riêng)
- [Ví dụ runnable với PostgreSQL](#ví-dụ-runnable-với-postgresql)
  - [Điều kiện chuẩn bị](#điều-kiện-chuẩn-bị)
  - [Workflow](#workflow)
  - [Cách kiểm chứng](#cách-kiểm-chứng)
- [Bài thực hành](#bài-thực-hành)
  - [Yêu cầu](#yêu-cầu)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Tình huống production](#tình-huống-production)
  - [Nhiều service trong integration test](#nhiều-service-trong-integration-test)
  - [Volumes và dữ liệu tạm thời](#volumes-và-dữ-liệu-tạm-thời)
  - [Tài nguyên và tính tái lập](#tài-nguyên-và-tính-tái-lập)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Bài liên quan](#bài-liên-quan)

## Tổng quan

Container là một tiến trình được cô lập cùng filesystem và dependency riêng. Trong GitHub Actions, container giúp CI dùng cùng runtime ở mọi runner Linux. Ví dụ, job có thể luôn chạy với Node.js từ một image đã chọn thay vì phụ thuộc vào phần mềm cài sẵn trên runner.

**Service container** là container phụ trợ cho một job. Nó thường chạy PostgreSQL, Redis, RabbitMQ hoặc một API giả lập trong lúc integration test thực thi. Integration test là kiểm thử cách nhiều thành phần làm việc cùng nhau, chẳng hạn ứng dụng ghi rồi đọc dữ liệu từ database.

GitHub tạo service mới cho từng job và xóa nó khi job kết thúc. Vì vậy, service container phù hợp với môi trường test ngắn hạn. Nó không phải database dùng chung hoặc nơi lưu dữ liệu lâu dài.

## Hai loại container trong một job

### Job container

Khai báo `jobs.<job_id>.container` để mọi `run` step của job chạy bên trong image đó:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container: node:24-bookworm-slim
    steps:
      - run: node --version
```

`runs-on` vẫn bắt buộc. Runner Ubuntu là Docker host, tức máy điều khiển vòng đời container. Image `node:24-bookworm-slim` là môi trường nơi command của job chạy.

Nếu một step dùng Docker container action, action đó chạy trong một sibling container. Sibling container là container ngang hàng trên cùng network, không phải container lồng bên trong job container.

<Callout type="warn" title="Shell mặc định là sh">
  `run` step trong job container dùng `sh` mặc định, không phải `bash`. Nếu script cần `[[ ... ]]`, array hoặc `set -o pipefail`, hãy chọn image có Bash và đặt `defaults.run.shell: bash`.
</Callout>

### Service container

Khai báo `jobs.<job_id>.services` để tạo một hoặc nhiều dịch vụ dành riêng cho job:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:8-alpine
        ports:
          - 6379:6379
```

`redis` là service ID. Khi job cũng chạy trong container, ID này trở thành hostname `redis`. Khi job chạy trực tiếp trên runner, client dùng `localhost` và host port đã map.

Service container không thể được tạo bên trong composite action. Hãy khai báo service ở job gọi composite action.

### Vòng đời do runner quản lý

Runner thực hiện các bước chính sau:

```mermaid
sequenceDiagram
  participant G as GitHub Actions
  participant R as Linux runner
  participant J as Job container
  participant S as Service container

  G->>R: Cấp phát job
  R->>R: Pull image và tạo Docker network
  R->>S: Tạo service, áp dụng env và health check
  R->>J: Tạo job container và mount workspace
  R->>J: Chạy từng step
  J->>S: Gọi service qua hostname và port nội bộ
  J-->>R: Trả exit code và log
  R->>J: Xóa job container
  R->>S: Xóa service container và network
  R-->>G: Báo trạng thái job
```

Mỗi job có service container riêng. Hai job song song không chia sẻ database state mặc định, ngay cả khi cùng service ID và image. Ngoại lệ là khi cấu hình chủ động cho chúng dùng chung named volume hoặc bind mount trên cùng Docker host.

## Cơ chế mạng

### Job chạy trong container

Khi có `container:`, GitHub nối job container và các service vào một Docker user-defined bridge network. Bridge network là mạng ảo riêng do Docker tạo cho nhóm container.

Quy tắc kết nối:

- Hostname của service bằng service ID, ví dụ `postgres` hoặc `redis`.
- Dùng port nội bộ mặc định của service, ví dụ PostgreSQL `5432`.
- Không cần khai báo `ports` để các container trên cùng network nói chuyện.
- Port không tự động được công khai ra ngoài Docker host.

Ví dụ connection string:

```text
postgresql://app:password@postgres:5432/app_test
```

### Job chạy trực tiếp trên runner

Nếu không có `container:`, các `run` step chạy trên máy runner. Service vẫn ở trong Docker, nên cần publish port sang host:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - 5432:5432
```

Client khi đó kết nối `localhost:5432` hoặc `127.0.0.1:5432`. Dùng hostname `postgres` từ host sẽ không hoạt động vì Docker DNS name chỉ có ý nghĩa bên trong network của container.

Sơ đồ so sánh:

```mermaid
flowchart LR
  subgraph A[Job chạy trong container]
    JC[Job container] -->|postgres:5432| SC[(Service postgres)]
  end

  subgraph B[Job chạy trên runner]
    RH[Runner host] -->|localhost:host_port| PM[Docker port mapping]
    PM -->|container port 5432| SR[(Service postgres)]
  end
```

### Chọn port cố định hay ngẫu nhiên

Mapping cố định dễ đọc:

```yaml
ports:
  - 5432:5432
```

Nhưng self-hosted runner có thể đã dùng host port `5432`. Để Docker chọn một port trống, chỉ ghi container port:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - 5432/tcp
```

Đọc host port đã cấp qua `job` context:

```yaml
- name: Show assigned port
  env:
    POSTGRES_PORT: ${{ job.services.postgres.ports['5432'] }}
  run: echo "PostgreSQL is on localhost:${POSTGRES_PORT}"
```

Dùng random host port là lựa chọn an toàn khi nhiều runner agent hoặc tiến trình có thể dùng chung một self-hosted host và Docker daemon.

## Cú pháp cấu hình

### Cấu hình jobs container

Dạng đầy đủ hỗ trợ các trường sau:

```yaml
container:
  image: ghcr.io/acme/ci-node:24
  credentials:
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
  env:
    NODE_ENV: test
  ports:
    - 3000
  volumes:
    - ci-data:/var/lib/ci-data
  options: --cpus 2 --memory 4g
```

| Trường | Ý nghĩa |
|---|---|
| `image` | Image từ Docker Hub hoặc registry khác |
| `credentials` | Username và password để pull private image |
| `env` | Biến môi trường bên trong job container |
| `ports` | Port expose của job container |
| `volumes` | Named volume, anonymous volume hoặc bind mount |
| `options` | Tùy chọn bổ sung cho `docker create` |

Với `volumes`, destination phải là path tuyệt đối trong container. Source là tên Docker volume hoặc path tuyệt đối trên host. Ví dụ `ci-data:/cache` hợp lệ. Mapping `./cache:/cache` không hợp lệ vì source bind mount không tuyệt đối.

`container.options` không hỗ trợ `--network` và `--entrypoint`. GitHub cần tự quản lý network và cách khởi động job container.

### Cấu hình jobs services

Mỗi service có thể dùng:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: test-password
      POSTGRES_DB: app_test
    ports:
      - 5432/tcp
    options: >-
      --health-cmd "pg_isready -U app -d app_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
```

Service còn hỗ trợ `credentials`. Cú pháp hiện hành cũng có `command` để thay `CMD` và `entrypoint` để thay `ENTRYPOINT` của image. Phần lớn trường hợp chỉ cần `command` vì image đã có entrypoint đúng.

```yaml
services:
  mysql:
    image: mysql:8.4
    command: --sql_mode=STRICT_TRANS_TABLES --max_allowed_packet=512M
    env:
      MYSQL_ROOT_PASSWORD: test-password
```

`services.<service_id>.options` không hỗ trợ `--network`. Không tự tạo network khác vì sẽ phá hostname và kết nối mà runner thiết lập.

### Health check và readiness

Container ở trạng thái running chưa chắc service đã sẵn sàng nhận request. **Readiness** là trạng thái dịch vụ đã khởi động đủ để phục vụ client.

Đặt Docker health check trong `options`:

```yaml
options: >-
  --health-cmd "pg_isready -U app -d app_test"
  --health-interval 5s
  --health-timeout 5s
  --health-retries 10
```

Health command chạy bên trong service container. Vì vậy, binary như `pg_isready` phải có trong image service. Dùng command kiểm tra đúng giao thức thay vì chỉ kiểm tra port mở.

Nếu image không có health check phù hợp, thêm vòng lặp retry ở step client với timeout rõ ràng. Không dùng `sleep 30` cố định. Máy nhanh phải chờ thừa, còn máy chậm vẫn có thể chưa sẵn sàng.

### Image từ registry riêng

Dùng `credentials` cho cả job container và service:

```yaml
services:
  api:
    image: ghcr.io/acme/private-test-api:1.8.3
    credentials:
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
```

Để pull image GHCR riêng, `GITHUB_TOKEN` cần quyền `packages: read` và repository phải được cấp quyền truy cập package. Với registry khác, lưu credential trong GitHub secrets.

Không truyền password qua `options` hoặc ghi thẳng vào workflow. Các giá trị đó dễ xuất hiện trong log hoặc metadata tiến trình.

## Ví dụ runnable với PostgreSQL

### Điều kiện chuẩn bị

Ví dụ không cần source code hay secret. Chỉ cần:

- Repository đã bật GitHub Actions.
- Quyền tạo file trong `.github/workflows/`.
- GitHub-hosted `ubuntu-latest`, hoặc self-hosted Linux runner có Docker.

Job dùng image PostgreSQL làm môi trường client vì image đã có `psql`. Service PostgreSQL là một container riêng trên cùng network.

### Workflow

Tạo `.github/workflows/postgres-service.yml`:

```yaml
name: PostgreSQL service lab

on:
  workflow_dispatch:
  push:
    paths:
      - '.github/workflows/postgres-service.yml'

permissions: {}

jobs:
  integration-test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    container:
      image: postgres:16-alpine
      env:
        PGPASSWORD: test-password

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: test-password
          POSTGRES_DB: app_test
        options: >-
          --health-cmd "pg_isready -U app -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    steps:
      - name: Create schema and seed data
        run: |
          psql \
            --host postgres \
            --username app \
            --dbname app_test \
            --set ON_ERROR_STOP=1 <<'SQL'
          CREATE TABLE messages (
            id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            body text NOT NULL
          );
          INSERT INTO messages (body) VALUES ('service container works');
          SQL

      - name: Verify data
        run: |
          row_count="$(psql \
            --host postgres \
            --username app \
            --dbname app_test \
            --tuples-only \
            --no-align \
            --command 'SELECT count(*) FROM messages;')"

          test "$row_count" = "1"
          echo "Verified rows=$row_count via postgres:5432"
```

Không có `ports` trong service vì job đã chạy trong container. Hostname phải là `postgres`, đúng với service ID.

`permissions: {}` tắt mọi scope của `GITHUB_TOKEN`. Workflow không checkout code và không gọi GitHub API, nên không cần token repository.

### Cách kiểm chứng

1. Chạy **PostgreSQL service lab** từ tab Actions.
2. Trong phần khởi tạo job, xác nhận GitHub tạo service `postgres` và health check chuyển sang healthy.
3. Step **Create schema and seed data** phải kết thúc với exit code `0`.
4. Step **Verify data** phải in `Verified rows=1 via postgres:5432`.
5. Xóa dòng `POSTGRES_PASSWORD` của service trong một branch thử nghiệm. Job phải thất bại khi service khởi động. Khôi phục dòng đó sau khi đã quan sát log.
6. Chạy lại workflow. Database mới vẫn chỉ có một row, chứng minh service state không tồn tại qua các job.

<Callout type="warn" title="Credential trong ví dụ chỉ dùng cho test">
  `test-password` là credential tạm trong network riêng của job. Không sao chép cách ghi thẳng password này cho môi trường staging hoặc production. Hãy dùng GitHub secrets và cơ chế xác thực phù hợp.
</Callout>

## Bài thực hành

### Yêu cầu

Tạo một job chạy trực tiếp trên `ubuntu-latest`, không dùng `container:`. Job cần:

1. Khởi tạo service PostgreSQL `16-alpine`.
2. Chỉ khai báo container port `5432/tcp` để Docker chọn host port trống.
3. Lấy port qua `${{ job.services.postgres.ports['5432'] }}`.
4. Dùng một client hoặc test script trong repository để kết nối `localhost:<host-port>`.
5. Tạo một bảng, thêm hai row và assert `count(*) = 2`.
6. Giữ health check và `timeout-minutes`.

Sau đó thêm service Redis. Test phải ghi rồi đọc một key qua host port ngẫu nhiên của Redis.

### Tiêu chí kiểm chứng

- [ ] Job chạy trực tiếp trên runner và không có `container:`.
- [ ] PostgreSQL client dùng `localhost`, không dùng hostname `postgres`.
- [ ] Workflow không hard-code host port `5432` hoặc `6379`.
- [ ] Hai service có health check riêng và log cho biết đã healthy.
- [ ] Assertion PostgreSQL xác nhận đúng hai row.
- [ ] Assertion Redis đọc lại đúng giá trị vừa ghi.
- [ ] Nếu một self-hosted host có nhiều runner agent, hai lần chạy song song không xung đột host port.
- [ ] Job thất bại trong vòng timeout hữu hạn nếu một service không sẵn sàng.

## Tình huống production

### Nhiều service trong integration test

Một job có thể khai báo nhiều service:

```yaml
services:
  postgres:
    image: postgres:16-alpine
  redis:
    image: redis:8-alpine
  mock-api:
    image: ghcr.io/acme/mock-api:2.3.1
```

Khi job chạy trong container, ứng dụng gọi `postgres:5432`, `redis:6379` và `mock-api:<port>`. Service ID nên ngắn, ổn định và phản ánh vai trò.

Nhiều service làm startup chậm hơn và tiêu thụ thêm CPU, RAM, disk. Nếu test chỉ cần Redis, đừng khởi động cả PostgreSQL. Tách test suite thành các job theo dependency có thể tăng song song và làm lỗi dễ chẩn đoán hơn.

### Volumes và dữ liệu tạm thời

Named volume cho phép job container, service và các step trong cùng job chia sẻ dữ liệu. Tuy nhiên, named volume thuộc Docker host và có thể tồn tại sau khi runner xóa container hoặc network. Trên self-hosted host có nhiều runner agent, một tên volume cố định còn có thể làm các job vô tình chia sẻ state.

Với service test tạm thời, hãy tránh named volume. Nếu thật sự cần volume, đặt tên riêng theo run và có quy trình cleanup rõ ràng. Đừng dựa vào volume của job trước để cấp dữ liệu cho job sau.

Nếu job sau cần file của job trước, dùng artifact. Nếu cần database fixture, hãy chạy migration và seed rõ ràng ở đầu mỗi job. Fixture là bộ dữ liệu test được chuẩn bị trước.

Bind mount trên self-hosted runner có thể để lại file với owner của container. Nó cũng có thể làm lộ dữ liệu host nếu mount path quá rộng. Chỉ mount thư mục tối thiểu và dọn dữ liệu sau job.

### Tài nguyên và tính tái lập

`options` có thể giới hạn tài nguyên:

```yaml
container:
  image: ghcr.io/acme/ci:2026.03
  options: --cpus 2 --memory 4g
```

Giới hạn giúp phát hiện ứng dụng phụ thuộc quá mức vào tài nguyên. Tuy nhiên, đặt quá thấp gây test chập chờn. Hãy đo mức sử dụng trước khi chọn ngưỡng.

Tag như `latest`, `postgres:16` hoặc `redis:8-alpine` có thể trỏ tới image mới theo thời gian. Production CI cần tính tái lập cao nên pin digest:

```yaml
image: postgres:16-alpine@sha256:<digest-đã-xác-minh>
```

Digest là định danh nội dung bất biến của image. Dùng công cụ cập nhật dependency để mở pull request khi có digest mới, thay vì để image đổi âm thầm.

## Best practices

- **Chọn đúng topology mạng.** Job container dùng `service-id:container-port`; host job dùng `localhost:host-port`.
- **Thêm health check theo giao thức.** Dùng `pg_isready`, `redis-cli ping` hoặc endpoint health thay vì `sleep` cố định.
- **Pin image bằng version và digest.** Tránh `latest`; cập nhật digest qua pull request có review.
- **Giảm quyền token.** Dùng `permissions: {}` nếu không cần API. Chỉ thêm `packages: read` khi pull private image yêu cầu.
- **Giữ service state dùng một lần.** Migration và seed ở đầu job. Không giả định dữ liệu còn từ run trước.
- **Dùng random host port trên self-hosted host.** Cách này tránh xung đột khi nhiều runner agent dùng chung Docker daemon hoặc khi tiến trình khác đã chiếm port.
- **Giới hạn tài nguyên và thời gian.** Đặt `timeout-minutes`, health retries và resource options dựa trên số liệu.
- **Chọn image có công cụ cần thiết.** Job container tối giản có thể thiếu Bash, Git, CA certificate hoặc package manager.
- **Không mount path host rộng.** Đặc biệt tránh Docker socket nếu job chạy code pull request không tin cậy.
- **Không đặt secret trong image hoặc YAML.** Dùng GitHub secrets và credential có quyền tối thiểu.
- **Tách service theo nhu cầu test.** Ít service hơn giúp job nhanh, log rõ và giảm điểm lỗi.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Workflow báo service/container chỉ hỗ trợ Linux | `runs-on` là Windows hoặc macOS | Dùng Ubuntu; self-hosted runner phải là Linux và có Docker |
| `getaddrinfo ENOTFOUND postgres` | Job chạy trên host nhưng client dùng service ID | Map `ports` và kết nối `localhost`; chỉ dùng `postgres` trong job container |
| `Connection refused` ngay đầu test | Service process chưa ready hoặc health check thiếu/sai | Thêm health check đúng binary, interval, timeout và retries; xem log service |
| Job container không kết nối `localhost` tới service | `localhost` trỏ về chính job container | Đổi host thành service ID, ví dụ `postgres:5432` |
| Host job không kết nối được service | Chưa khai báo `ports` hoặc dùng nhầm host port | Publish port và đọc `${{ job.services.<id>.ports['<container-port>'] }}` |
| `bash: not found` hoặc script lỗi cú pháp | Image tối giản chỉ có `sh`; shell mặc định trong container là `sh` | Viết POSIX `sh`, hoặc chọn image có Bash và cấu hình `shell: bash` |
| Pull private image trả `unauthorized` | Thiếu `credentials`, `packages: read` hoặc package access | Cấp quyền package cho repository và truyền credential quyền tối thiểu |
| Docker báo port đã được dùng | Hard-code host port trên máy có nhiều runner agent hoặc port đã bị tiến trình khác chiếm | Chỉ khai báo container port để nhận port ngẫu nhiên |
| Service health check luôn unhealthy | Command không có trong image hoặc kiểm tra sai user/database | Chạy command có sẵn trong image và truyền đúng tham số service |
| `--network` hoặc `--entrypoint` bị từ chối trong options | GitHub không hỗ trợ các cờ đó ở vị trí tương ứng | Để runner quản lý network; dùng trường `entrypoint` của service nếu thật sự cần |
| File mount bị `Permission denied` | UID/GID trong container khác owner trên host | Chọn path ghi được, điều chỉnh user của image hoặc quyền thư mục tối thiểu |
| Test pass cục bộ nhưng fail trong container | Thiếu CA, timezone, locale, native library hoặc khác kiến trúc | So sánh image/digest, in version cần thiết và thêm dependency vào CI image có kiểm soát |
| Self-hosted runner hết disk sau nhiều run | Docker image, layer hoặc volume không được dọn đúng cách | Giám sát Docker disk usage, cập nhật runner và áp dụng quy trình prune an toàn ngoài job không tin cậy |

## Tài liệu tham khảo

- [Communicating with Docker service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers) — topology mạng, hostname và port mapping.
- [Workflow syntax: jobs container và services](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idcontainer) — các trường `image`, `credentials`, `env`, `ports`, `volumes` và `options`.
- [Creating PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) — ví dụ chính thức cho job container và runner job.
- [Creating Redis service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-redis-service-containers) — health check và hai cách kết nối Redis.
- [Using containerized services](https://docs.github.com/en/actions/tutorials/use-containerized-services) — nhóm hướng dẫn chính thức về service containers.
- [Contexts reference: job context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context) — đọc host port được Docker cấp động.
- [Publishing Docker container ports](https://docs.docker.com/engine/network/#published-ports) — nền tảng Docker cho host-to-container port mapping.

## Bài liên quan

<Cards>
  <Card title="Dependency caching" href="/docs/dieu-khien-workflow/09-dependency-caching/" description="Tăng tốc bước cài dependency bên trong hoặc bên ngoài container." />
  <Card title="Defaults và timeouts" href="/docs/dieu-khien-workflow/06-defaults-timeouts/" description="Chọn shell, working directory và giới hạn thời gian cho job container." />
  <Card title="Artifacts" href="/docs/dieu-khien-workflow/08-artifacts/" description="Chuyển file qua ranh giới job thay vì dựa vào volume tạm." />
</Cards>
