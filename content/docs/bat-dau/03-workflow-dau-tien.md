---
title: "Workflow đầu tiên"
description: "Tạo, chạy, quan sát, làm hỏng, sửa và kích hoạt thủ công một workflow GitHub Actions đầu tiên."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn sẽ có một workflow chạy được trên mọi repository mà không cần dự án mẫu hay dependency. Bạn cũng sẽ biết cách đọc log, chẩn đoán một lỗi có chủ đích, sửa lỗi và chạy workflow bằng tay.
</Callout>

## Mục lục

- [Kết quả cần đạt](#kết-quả-cần-đạt)
- [Chuẩn bị](#chuẩn-bị)
  - [Chọn hoặc tạo repository](#chọn-hoặc-tạo-repository)
  - [Chuẩn bị máy cục bộ](#chuẩn-bị-máy-cục-bộ)
- [Tạo và chạy workflow](#tạo-và-chạy-workflow)
  - [Mở bản sao cục bộ](#mở-bản-sao-cục-bộ)
  - [Tạo file workflow](#tạo-file-workflow)
  - [Commit và push](#commit-và-push)
  - [Xem run và log đầu tiên](#xem-run-và-log-đầu-tiên)
- [Hiểu từng khối trong workflow](#hiểu-từng-khối-trong-workflow)
  - [Tên workflow với name](#tên-workflow-với-name)
  - [Sự kiện kích hoạt với on](#sự-kiện-kích-hoạt-với-on)
  - [Quyền của token với permissions](#quyền-của-token-với-permissions)
  - [Danh sách công việc với jobs](#danh-sách-công-việc-với-jobs)
  - [Máy thực thi với runs-on](#máy-thực-thi-với-runs-on)
  - [Giới hạn thời gian với timeout-minutes](#giới-hạn-thời-gian-với-timeout-minutes)
  - [Các bước với steps](#các-bước-với-steps)
  - [Dùng action có sẵn với uses](#dùng-action-có-sẵn-với-uses)
  - [Chạy lệnh shell với run](#chạy-lệnh-shell-với-run)
- [Cố ý gây lỗi rồi sửa](#cố-ý-gây-lỗi-rồi-sửa)
  - [Tạo một lỗi có chủ đích](#tạo-một-lỗi-có-chủ-đích)
  - [Đọc log lỗi](#đọc-log-lỗi)
  - [Sửa lỗi và xác nhận](#sửa-lỗi-và-xác-nhận)
- [Chạy workflow thủ công](#chạy-workflow-thủ-công)
  - [Chạy từ GitHub UI](#chạy-từ-github-ui)
  - [Chạy bằng GitHub CLI](#chạy-bằng-github-cli)
- [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Thực hành an toàn tối thiểu](#thực-hành-an-toàn-tối-thiểu)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Kết quả cần đạt

Workflow trong bài thực hiện ba việc đơn giản nhưng thực tế:

1. Chạy tự động sau mỗi lần `push` và cho phép chạy bằng tay.
2. Checkout repository vào runner để các lệnh sau có thể đọc mã nguồn.
3. In thông tin của lần chạy và kiểm tra file workflow thực sự tồn tại.

Luồng thực hành là:

```text
Tạo file → commit → push → xem run thành công
                           ↓
                  sửa thành lệnh sai
                           ↓
             push → đọc log lỗi → sửa → push
                           ↓
                    chạy thủ công
```

Bài này dùng lệnh shell thay vì một dự án Node.js mẫu. Vì vậy, bạn có thể làm theo trên repository mới, repository tài liệu hoặc repository mã nguồn hiện có.

## Chuẩn bị

Bạn cần:

- một tài khoản GitHub;
- quyền ghi vào repository;
- Git đã được cài trên máy nếu thao tác cục bộ;
- GitHub Actions đang được bật cho repository.

GitHub CLI (`gh`) chỉ cần thiết cho phần tùy chọn ở cuối bài.

### Chọn hoặc tạo repository

Bạn có thể dùng một trong hai cách:

- **Repository có sẵn:** chọn repository mà bạn có quyền ghi. Thay đổi trong bài chỉ thêm một file dưới `.github/workflows/`.
- **Repository mới:** trên GitHub, chọn **New repository**, đặt tên, chọn mức hiển thị và tạo repository. Chọn thêm `README.md` nếu muốn có sẵn commit đầu tiên để clone ngay.

<Callout type="warn" title="Repository của tổ chức">
  Tổ chức có thể giới hạn action được phép dùng, yêu cầu workflow phải pin theo commit SHA hoặc chặn GitHub Actions. Nếu gặp chính sách này, hãy làm theo quy định của tổ chức thay vì nới lỏng bảo mật.
</Callout>

### Chuẩn bị máy cục bộ

Nếu repository chưa có trên máy, mở repository trên GitHub, chọn **Code**, sao chép HTTPS URL rồi chạy:

```bash
git clone URL_VUA_SAO_CHEP
cd TEN_THU_MUC_REPOSITORY
```

Nếu repository đã có trên máy, chuyển vào thư mục đó và lấy thay đổi mới nhất trước khi bắt đầu:

```bash
git pull --ff-only
```

Bạn cũng có thể tạo file trực tiếp trên GitHub bằng **Add file → Create new file** và nhập đường dẫn `.github/workflows/hello-actions.yml`. Tuy nhiên, các bước dưới đây dùng Git cục bộ để bạn thực hành đầy đủ vòng lặp commit và push.

## Tạo và chạy workflow

<Steps>
<Step>

### Mở bản sao cục bộ

Đảm bảo terminal đang ở thư mục gốc của repository. Lệnh sau phải hiển thị thư mục `.git`:

```bash
ls -la
```

Nếu dùng Windows PowerShell, bạn có thể dùng `Get-ChildItem -Force` thay cho `ls -la`.

</Step>
<Step>

### Tạo file workflow

Tạo đúng thư mục mà GitHub dùng để tìm workflow:

```bash
mkdir -p .github/workflows
```

Tạo file `.github/workflows/hello-actions.yml` bằng editor, rồi dán nguyên nội dung sau:

```yaml
name: Hello Actions

on:
  push:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  hello:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Lấy mã nguồn
        uses: actions/checkout@v7

      - name: Chào từ runner
        run: |
          echo "Xin chào từ GitHub Actions!"
          echo "Repository: $GITHUB_REPOSITORY"
          echo "Commit: $GITHUB_SHA"

      - name: Kiểm tra file workflow
        run: test -f .github/workflows/hello-actions.yml
```

`on` nằm trong code block nên MDX không diễn giải nó. Trong file YAML thật, hãy giữ nguyên dấu hai chấm và khoảng trắng như ví dụ. Không dùng tab để thụt lề YAML.

</Step>
<Step>

### Commit và push

Kiểm tra thay đổi, tạo commit rồi push nhánh hiện tại:

```bash
git status
git add .github/workflows/hello-actions.yml
git commit -m "ci: add first GitHub Actions workflow"
git push -u origin "$(git branch --show-current)"
```

Sự kiện `push` vừa tạo sẽ kích hoạt workflow. Nếu nhánh mặc định được bảo vệ, hãy push một nhánh mới và mở pull request; trigger `push` vẫn chạy trên nhánh đó.

</Step>
<Step>

### Xem run và log đầu tiên

1. Mở repository trên GitHub và chọn tab **Actions**.
2. Ở thanh bên trái, chọn workflow **Hello Actions**.
3. Chọn run mới nhất, sau đó chọn job **hello**.
4. Mở step **Chào từ runner** và tìm ba dòng bắt đầu bằng `Xin chào`, `Repository` và `Commit`.
5. Mở step **Kiểm tra file workflow**. Step hoàn tất với dấu kiểm màu xanh nghĩa là lệnh `test` trả về mã thoát `0`.

Run đầu tiên phải có kết luận **Success**. GitHub còn tự thêm các step như **Set up job** và **Complete job**; đây là phần chuẩn bị và dọn dẹp runner, không phải nội dung bạn đã khai báo.

</Step>
</Steps>

## Hiểu từng khối trong workflow

YAML biểu diễn cấu trúc bằng thụt lề. Một khóa nằm sâu hơn thuộc về khóa phía trên nó. Vì vậy, `steps` thuộc job `hello`, còn từng `name`, `uses` hoặc `run` bên trong thuộc về một step.

### Tên workflow với name

```yaml
name: Hello Actions
```

`name` đặt tên hiển thị của workflow trong tab **Actions**. Nếu bỏ khóa này, GitHub dùng đường dẫn file workflow làm tên, khó đọc hơn khi repository có nhiều workflow.

### Sự kiện kích hoạt với on

```yaml
on:
  push:
  workflow_dispatch:
```

`on` khai báo trigger, tức sự kiện làm workflow bắt đầu:

- `push` chạy workflow khi commit hoặc tag được push. Vì ví dụ không đặt bộ lọc nhánh, workflow có thể chạy trên mọi nhánh và tag có chứa file workflow tương ứng.
- `workflow_dispatch` thêm nút **Run workflow** để người có quyền ghi chạy bằng tay. File workflow phải tồn tại trên nhánh mặc định thì GitHub mới nhận trigger thủ công.

Khi khai báo nhiều sự kiện theo dạng khối, mỗi sự kiện đều có dấu hai chấm. `push:` và `workflow_dispatch:` không có cấu hình con nên được để trống.

### Quyền của token với permissions

```yaml
permissions:
  contents: read
```

Mỗi job nhận một `GITHUB_TOKEN` tạm thời. `permissions` giới hạn quyền của token đó theo nguyên tắc đặc quyền tối thiểu. Workflow chỉ cần đọc nội dung để checkout nên `contents: read` là đủ. Khi một quyền được chỉ định, các quyền không nêu ra được đặt thành `none`.

### Danh sách công việc với jobs

```yaml
jobs:
  hello:
```

`jobs` chứa một hoặc nhiều công việc. `hello` là ID do bạn đặt; GitHub dùng ID này trong đồ thị run và khi các job khác cần tham chiếu đến nó. Các job độc lập chạy song song theo mặc định, nhưng bài này chỉ cần một job.

### Máy thực thi với runs-on

```yaml
runs-on: ubuntu-latest
```

`runs-on` chọn runner, tức máy thực thi job. `ubuntu-latest` yêu cầu một máy ảo Ubuntu do GitHub quản lý. GitHub chuẩn bị máy cho run, thực thi các step theo thứ tự rồi hủy máy sau khi job kết thúc.

### Giới hạn thời gian với timeout-minutes

```yaml
timeout-minutes: 5
```

`timeout-minutes` hủy job nếu nó chạy quá thời gian cho phép. Năm phút rộng rãi cho workflow nhỏ này và giúp một lệnh bị treo không tiêu thụ runner vô thời hạn.

### Các bước với steps

```yaml
steps:
  - name: Lấy mã nguồn
    uses: actions/checkout@v7
```

`steps` là danh sách các bước chạy tuần tự trong cùng một job. Các step dùng chung workspace trên runner, nên file mà step checkout lấy về sẽ có sẵn cho các step `run` phía sau. `name` bên trong step là nhãn dễ đọc trong log; nó khác với `name` cấp workflow.

### Dùng action có sẵn với uses

```yaml
uses: actions/checkout@v7
```

`uses` gọi một action có thể tái sử dụng. `actions/checkout` lấy nội dung repository về `$GITHUB_WORKSPACE`; nếu không có step này, runner không tự chứa mã nguồn của bạn.

Ví dụ pin action theo major tag `v7`, phiên bản đang được trang Marketplace chính thức của `actions/checkout` hướng dẫn sử dụng. Không dùng `@main` vì nhánh có thể thay đổi bất cứ lúc nào. Với workflow cần bảo đảm chuỗi cung ứng chặt chẽ, GitHub khuyến nghị pin theo **full-length commit SHA** vì đó là tham chiếu bất biến, rồi dùng Dependabot để theo dõi cập nhật.

### Chạy lệnh shell với run

```yaml
run: test -f .github/workflows/hello-actions.yml
```

`run` gửi lệnh cho shell trên runner. Trên Ubuntu, `test -f` trả về `0` khi file tồn tại và trả về giá trị khác `0` khi không tồn tại. Mã thoát khác `0` làm step thất bại và job dừng lại.

Dấu `|` ở step **Chào từ runner** cho phép viết nhiều lệnh shell trên nhiều dòng:

```yaml
run: |
  echo "Dòng thứ nhất"
  echo "Dòng thứ hai"
```

## Cố ý gây lỗi rồi sửa

Đọc một run màu đỏ là kỹ năng thiết yếu. Thay vì tạo lỗi YAML khiến GitHub không thể nạp workflow, phần này tạo lỗi lúc chạy để bạn thấy rõ job, step và mã thoát.

<Steps>
<Step>

### Tạo một lỗi có chủ đích

Trong `.github/workflows/hello-actions.yml`, đổi **chỉ** step cuối thành:

```yaml
      - name: Kiểm tra file workflow
        run: test -f .github/workflows/file-khong-ton-tai.yml
```

Commit và push thay đổi:

```bash
git add .github/workflows/hello-actions.yml
git commit -m "test: demonstrate a failing workflow"
git push
```

</Step>
<Step>

### Đọc log lỗi

Mở **Actions → Hello Actions → run mới nhất → hello**. Kết quả mong đợi:

- run và job có trạng thái **Failure**;
- step **Lấy mã nguồn** và **Chào từ runner** vẫn thành công;
- step **Kiểm tra file workflow** thất bại;
- log hiển thị lệnh kiểm tra file không tồn tại và thông báo dạng `Process completed with exit code 1`.

Điểm cần nhớ: tìm **step đỏ đầu tiên** rồi đọc vài dòng cuối của log step đó. Trong trường hợp này, mã thoát `1` đến từ `test -f`, không phải từ `actions/checkout`.

</Step>
<Step>

### Sửa lỗi và xác nhận

Đổi đường dẫn trong step cuối về đúng tên:

```yaml
      - name: Kiểm tra file workflow
        run: test -f .github/workflows/hello-actions.yml
```

Commit và push bản sửa:

```bash
git add .github/workflows/hello-actions.yml
git commit -m "fix: restore workflow file check"
git push
```

Mở run mới. Run này phải **Success**. Run lỗi trước đó vẫn được giữ lại, tạo thành lịch sử hữu ích để so sánh trước và sau khi sửa.

</Step>
</Steps>

<Callout type="info" title="Re-run không dùng mã mới">
  Nút **Re-run jobs** chạy lại cùng commit và cùng phiên bản workflow của run cũ. Sau khi sửa code, hãy xem run do commit mới tạo ra; re-run bản lỗi cũ vẫn sẽ kiểm tra đường dẫn sai.
</Callout>

## Chạy workflow thủ công

`workflow_dispatch` đã có ngay từ workflow ban đầu. Sau khi file xuất hiện trên nhánh mặc định, bạn có thể chạy mà không cần tạo commit mới.

### Chạy từ GitHub UI

1. Mở tab **Actions** và chọn **Hello Actions** ở thanh bên.
2. Chọn **Run workflow** phía trên danh sách run.
3. Chọn nhánh muốn chạy.
4. Chọn **Run workflow** trong hộp xác nhận.
5. Mở run vừa tạo và xác nhận job `hello` thành công.

Bạn cần quyền ghi để kích hoạt workflow thủ công. Nếu không thấy nút, kiểm tra phần [Troubleshooting](#troubleshooting).

### Chạy bằng GitHub CLI

Đăng nhập GitHub CLI một lần, sau đó chạy workflow theo tên file:

```bash
gh auth login
gh workflow run hello-actions.yml
gh run watch
```

`gh workflow run` gửi sự kiện `workflow_dispatch` đến nhánh mặc định. `gh run watch` cho phép chọn run và theo dõi tiến trình trong terminal. Để đọc log sau khi run hoàn tất, dùng:

```bash
gh run view --log
```

## Tiêu chí kiểm chứng

Bạn đã hoàn thành bài khi có đủ bằng chứng sau:

| Tiêu chí | Cách xác nhận |
|---|---|
| GitHub nhận đúng workflow | **Hello Actions** xuất hiện trong tab **Actions**. |
| Trigger tự động hoạt động | Push tạo một run mới mà không cần bấm nút. |
| Checkout và lệnh shell hoạt động | Job `hello` có các step **Lấy mã nguồn**, **Chào từ runner** và **Kiểm tra file workflow**. |
| Log chứa đúng ngữ cảnh | Log in `Xin chào từ GitHub Actions!`, tên repository và commit SHA. |
| Bạn đã chẩn đoán lỗi | Lịch sử có một run **Failure** do `file-khong-ton-tai.yml` và log có mã thoát khác `0`. |
| Bản sửa hoạt động | Commit sửa lỗi tạo run **Success**. |
| Trigger thủ công hoạt động | Có một run được khởi tạo bằng **Run workflow** hoặc `gh workflow run`. |

## Thực hành an toàn tối thiểu

- **Giữ đặc quyền tối thiểu:** khai báo `permissions` rõ ràng. Chỉ nâng từ `contents: read` khi job thực sự cần ghi release, issue hoặc nội dung repository.
- **Pin action có chủ đích:** tutorial dùng major tag chính thức `actions/checkout@v7`. Với yêu cầu bảo mật cao, pin full commit SHA và bật Dependabot cho GitHub Actions.
- **Đặt timeout:** thêm `timeout-minutes` theo thời gian chạy bình thường của job để tránh lệnh treo.
- **Không in secret ra log:** lưu thông tin nhạy cảm trong GitHub Secrets và không `echo` giá trị của secret.
- **Xem action như dependency:** ưu tiên action từ nhà phát hành đã xác minh, đọc source và release notes trước khi dùng. Action có thể truy cập workspace và token trong phạm vi quyền của job.
- **Bảo vệ file workflow:** với repository dùng cho production, yêu cầu pull request review hoặc `CODEOWNERS` cho `.github/workflows/`.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không thấy tab **Actions** | Actions bị tắt ở repository hoặc bị chính sách tổ chức chặn. | Kiểm tra **Settings → Actions → General** hoặc liên hệ quản trị viên tổ chức. |
| Push xong nhưng không có run | File sai thư mục/phần mở rộng, chưa được commit, hoặc commit không chứa trigger `push`. | Xác nhận đường dẫn chính xác là `.github/workflows/hello-actions.yml`; chạy `git status` và `git log -1 --stat`; kiểm tra commit đã xuất hiện trên GitHub. |
| GitHub báo workflow không hợp lệ | YAML sai thụt lề, dùng tab, thiếu dấu `:` hoặc đặt `steps` sai cấp. | So sánh với workflow hoàn chỉnh trong bài. Giữ mỗi cấp thụt lề hai khoảng trắng và không dùng tab. |
| Không thấy nút **Run workflow** | Thiếu `workflow_dispatch`, file chưa ở nhánh mặc định hoặc tài khoản không có quyền ghi. | Merge/push workflow vào nhánh mặc định, xác nhận trigger tồn tại và kiểm tra quyền repository. |
| Step checkout bị từ chối | `GITHUB_TOKEN` thiếu `contents: read` hoặc tổ chức không cho dùng phiên bản action này. | Giữ `permissions: contents: read`; kiểm tra **Settings → Actions → General** và chính sách pin action của tổ chức. |
| Push vào nhánh mặc định bị từ chối | Branch protection yêu cầu pull request hoặc status check. | Tạo nhánh mới, push nhánh đó rồi mở pull request; không tắt branch protection chỉ để làm tutorial. |
| Step kiểm tra file thất bại sau khi đã sửa | Tên file hoặc chữ hoa/thường không khớp, hoặc commit sửa chưa được push. | Chạy `ls .github/workflows`, `git status` và kiểm tra commit mới nhất trên GitHub. |
| Re-run bản lỗi vẫn thất bại | Re-run dùng cùng commit SHA và workflow của lần chạy gốc. | Push commit sửa lỗi và xem run mới thay vì re-run run cũ. |

## Bước tiếp theo

<Cards>
  <Card title="Kiến trúc và luồng thực thi" href="/docs/bat-dau/02-kien-truc-va-luong-thuc-thi/" description="Hiểu event, workflow, job, step và runner kết nối với nhau như thế nào." />
  <Card title="Cấu trúc workflow" href="/docs/nen-tang/01-cau-truc-workflow/" description="Đi sâu vào cú pháp và cách tổ chức một workflow dễ bảo trì." />
  <Card title="Công thức Basic CI" href="/docs/cong-thuc/01-basic-ci/" description="Mở rộng ví dụ thành pipeline CI có cài dependency, kiểm tra và test." />
  <Card title="Lộ trình học tập" href="/docs/bat-dau/04-lo-trinh-hoc-tap/" description="Chọn chủ đề tiếp theo từ nền tảng đến vận hành production." />
</Cards>

## Tài liệu tham khảo

- [Quickstart for GitHub Actions](https://docs.github.com/en/actions/get-started/quickstart)
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Using workflow run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Checkout trên GitHub Marketplace](https://github.com/marketplace/actions/checkout)
