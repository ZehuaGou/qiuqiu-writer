# Nginx 安装与配置（macOS）

用于本地或生产环境：用 Nginx 托管前端静态文件，并把 `/api`、`/ai`、`/v1` 代理到后端。

---

## 访问不到？用 8888 端口（推荐）

1. **用项目内最小配置启动**（只监听 8888，避免与系统默认 8080/8000 冲突）：
   ```bash
   bash deploy/nginx/sync-and-reload.sh
   ```
   然后访问 **http://localhost:8888**。

2. **若要用 80 端口**，必须 root 启动：`sudo nginx`（且 `wawawriter.conf` 里为 `listen 80`）。

3. **确认前端已打包**：`cd frontend && npm run build`。

更多排查：`bash deploy/nginx/check-access.sh`。Intel Mac 需改 `sync-and-reload.sh` 与 `nginx-minimal.conf` 中的路径为 `/usr/local`。

---

## 一、下载与安装（Homebrew）

### 1. 安装 Homebrew（若未安装）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

按提示完成安装后，根据提示将 Homebrew 加入 PATH（例如执行它输出的 `echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile`）。

### 2. 安装 Nginx

```bash
brew install nginx
```

若报错目录不可写（如 `Cellar is not writable`），先修复 Homebrew 目录归属后再安装：

```bash
sudo chown -R $(whoami) /opt/homebrew /Users/$(whoami)/Library/Logs/Homebrew
brew install nginx
```

### 3. 查看安装信息

- 配置文件目录：`/opt/homebrew/etc/nginx/`（Apple Silicon）或 `/usr/local/etc/nginx/`（Intel）
- 默认端口：**8080**（无需 root）
- 启动：`nginx`；停止：`nginx -s stop`；重载配置：`nginx -s reload`

---

## 二、配置 wawawriter

### 1. 修改站点配置中的路径（如需要）

编辑 `deploy/nginx/wawawriter.conf`，将 `root` 改为你本机的前端打包目录，例如：

```nginx
root   /Users/你的用户名/Documents/wawawriter/frontend/dist;
```

### 2. 把站点配置挂到 Nginx

**方式 A：在主配置里 include（推荐）**

编辑 Nginx 主配置（见上“配置文件目录”）：

- Apple Silicon: `nano /opt/homebrew/etc/nginx/nginx.conf`
- Intel: `nano /usr/local/etc/nginx/nginx.conf`

在 `http { ... }` 里、在原有 `include servers/*;` 附近增加一行（路径按你项目位置改）：

```nginx
include /Users/pang/Documents/wawawriter/deploy/nginx/wawawriter.conf;
```

或把 `wawawriter.conf` 复制到 Nginx 的 `servers` 目录后保留原有 include，例如：

```bash
cp /Users/pang/Documents/wawawriter/deploy/nginx/wawawriter.conf /opt/homebrew/etc/nginx/servers/
```

**方式 B：替换默认 default server**

若主配置里有 `include servers/*;`，可先备份再替换默认站点：

```bash
sudo cp /opt/homebrew/etc/nginx/servers/default.conf /opt/homebrew/etc/nginx/servers/default.conf.bak
sudo cp /Users/pang/Documents/wawawriter/deploy/nginx/wawawriter.conf /opt/homebrew/etc/nginx/servers/default.conf
# 注意：把 wawawriter.conf 里的 root 路径改成你本机的 frontend/dist 绝对路径
```

### 3. 消除 “conflicting server name localhost on 0.0.0.0:8080”

主配置里自带一个默认站点也监听 8080 + `server_name localhost`，会和我们站冲突。**保留我们站点、关掉默认站点**即可：

1. 打开主配置：
   - Apple Silicon: `nano /opt/homebrew/etc/nginx/nginx.conf`
   - Intel: `nano /usr/local/etc/nginx/nginx.conf`
2. 找到 **第一个** `server {` 块（通常含 `listen 8080;` 和 `server_name localhost;`），把整个该 `server { ... }` 块**注释掉**（每行前加 `#`），或删掉该块。
3. 确保保留 `include servers/*;` 这一行，保存退出。
4. 再执行：`nginx -t` 应只剩 “syntax is ok” 和 “test is successful”，不应再出现 “conflicting server name”。

### 4. 检查配置并启动

```bash
nginx -t
nginx
```

浏览器访问：**http://localhost:8080**（若在配置里改了 `listen 80` 则为 http://localhost）。

---

## 三、前端打包与后端

1. **前端打包**（生成 `frontend/dist`）  
   ```bash
   cd frontend && npm run build
   ```

2. **后端运行**（Nginx 会把 /api、/ai、/v1 转到 8001）  
   ```bash
   # 在项目根或 backend 目录启动，监听 8001
   uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001
   ```

确保后端监听 **8001**，与 `wawawriter.conf` 里 `proxy_pass http://127.0.0.1:8001` 一致。

---

## 四、若仍报 “conflicting server name” 的快速做法

主配置里自带一个 `listen 8080; server_name localhost;` 的默认站点，和 `wawawriter.conf` 冲突。二选一：

**方式 A：一键注释默认 server 块（第 36–76 行，保留第 77 行的 `}` 否则会报 server directive is not allowed here）**

```bash
# Apple Silicon（先恢复备份若你之前注释过 36-77）
cp /opt/homebrew/etc/nginx/nginx.conf.bak /opt/homebrew/etc/nginx/nginx.conf

# 只注释 36-76 行，保留 77 行的 } 以正确闭合 server 块
sed -i.bak '36,76s/^/#/' /opt/homebrew/etc/nginx/nginx.conf

# 校验
nginx -t
```

（Intel Mac 主配置路径一般为 `/usr/local/etc/nginx/nginx.conf`，把上面路径替换掉即可。）

**方式 B：手动编辑**

打开 `nginx.conf`，找到第一个 `server {` 块（含 `listen 8080;`、`server_name localhost;`、`root html;` 等），把整个该块每行行首加 `#` 注释掉，保存后执行 `nginx -t`。

## 五、常用命令

| 操作       | 命令            |
|------------|-----------------|
| 启动       | `nginx`         |
| 停止       | `nginx -s stop` |
| 重载配置   | `nginx -s reload` |
| 测试配置   | `nginx -t`      |
| 开机自启   | `brew services start nginx` |
| 关闭自启   | `brew services stop nginx`  |

---

## 六、使用 80 端口（必读：否则会「访问不到」）

当前 `wawawriter.conf` 为 **listen 80**。在 macOS 上普通用户无法绑定 80 端口，必须用 root 启动 Nginx：

```bash
sudo nginx
```

若之前用 `nginx`（无 sudo）启动过，会监听 8080 或根本起不来；**先停掉再 sudo 启动**：

```bash
nginx -s stop    # 若有旧进程
sudo nginx       # 用 root 启动，才能监听 80
```

然后访问：**http://localhost** 或 **http://127.0.0.1**。

若不想用 sudo，可把 `wawawriter.conf` 里改回 `listen 8080`（或 `listen 8888` 避免和 Docker 冲突），用 `nginx` 启动，访问 http://localhost:8080 或 http://localhost:8888。

---

## 七、生产部署注意

- 将 `root` 改为服务器上前端打包产物的实际路径。
- 后端若不在本机，把 `proxy_pass http://127.0.0.1:8001` 改为后端内网地址（如 `http://127.0.0.1:8001` 或 `http://backend:8001`）。
- 若使用 HTTPS，在 Nginx 上配置 SSL 并保持上述 `proxy_set_header X-Forwarded-Proto $scheme`。
