---
title: AI First 实践：从 Qoder 搭建博客服务器聊起
toc: true
type: 1
date: 2026-03-23 20:00:00
categories:
  - AI
tags:
- Qoder
- AI
---

本文摘要：

- 从零配置一台博客服务器的完整实践：SSH 免密登录、Nginx 部署、Cloudflare DNS、GitHub Webhook 自动部署
- 全程没有离开 Qoder 终端，涉及 5 个外部系统的联动操作
- Qoder 的能力边界远不止写代码，它可以操作你能 SSH 到的任何机器、调用任何有 API 的服务
- AI First 思维：遇到任何事情，先想想能不能用 AI 解决

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-01.png)

## 又要配服务器了

我的博客一直部署在自己的 ECS 上，最近旧的那台到期了，续费价格看了一眼就没有续费的欲望，索性买了一台新的。

![](https://image.cnkirito.cn/image-20260323165629171.png)

熟悉我博客的读者可能知道，这已经不是我第一次折腾博客服务器了。上一次配这套环境的时候，我开了四五个终端窗口，一边翻 Nginx 文档一边调配置，中间还要切到浏览器登录 Cloudflare 控制台改 DNS、登录 GitHub Settings 配 Webhook，前前后后折腾了大半天。流程我都很熟，但就是琐碎，每次换服务器都得把这些步骤重新走一遍，属于那种"会做但不想做"的事情。

但这次情况不一样了——我手边有 Qoder。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-02.png)

既然日常写代码都在 Qoder 里，配服务器这种事情不妨也试试全程在 Qoder 里完成。不是让它帮我写一个部署脚本，而是让它**直接操作**——SSH 到服务器装软件、调用 Cloudflare API 改 DNS、通过 GitHub CLI 创建 Webhook。整个过程还挺顺畅的，这篇文章就是把这个过程完整记录下来。

如果你还把 AI Coding 工具仅仅当作"写代码的助手"，希望这篇文章能帮你打开一些思路。

<!-- more -->

## SSH：从裸机到免密登录

新 ECS 到手之后，第一件事是配 SSH。我在 Qoder 里说了一句："帮我配置下 SSH 登录，新买了一台 ECS"。

Qoder 先读了我的 `~/.ssh/config`，发现我已经有一些现成的密钥对。然后它用 `ssh-copy-id` 把公钥传到了服务器上——这一步需要输入密码，Qoder 用 `expect` 自动化了交互式输入（这个细节挺有意思的，它知道 `ssh-copy-id` 需要交互式输入密码，于是自己换了一个方案）。

最后在 SSH config 里加了一行别名：

```
Host daofeng-blog
    HostName 8.210.140.252
    User root
    Port 22
```

从这一刻开始，`ssh daofeng-blog` 就是我跟这台服务器的全部交互方式。而 Qoder 后续的所有操作，也都是通过这个 SSH 通道完成的。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-03.png)

## Nginx：把博客"搬"过去

我的博客是 Hexo 搭的，Git 仓库有两个关键分支：`source` 是 Markdown 源码，`master` 是 GitHub Actions 构建好的静态 HTML。所以服务器上不需要装 Node.js，只需要拉 `master` 分支就行。

Qoder 在服务器上执行了三步：

```bash
# 1. 安装 Nginx 和 Git
yum install -y nginx git

# 2. 克隆 master 分支
git clone --depth 1 --branch master \
  https://github.com/lexburner/lexburner.github.io.git /var/www/blog

# 3. 创建 Nginx 配置
cat > /etc/nginx/conf.d/blog.conf << 'EOF'
server {
    listen 80 default_server;
    server_name www.cnkirito.moe cnkirito.moe;
    root /var/www/blog;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF
```

然后 `nginx -t && systemctl restart nginx`，博客就跑起来了。

到这一步，其实就是一个常规的静态站点部署，没什么特别的。但接下来的事情开始变得有意思了。

## Cloudflare：用 API 管理 DNS

我的域名 `cnkirito.moe` 经过了 Cloudflare 代理。一个自然的问题是：DNS 记录到底应该在域名注册商那儿改，还是在 Cloudflare 上改？

我把这个问题抛给了 Qoder，它直接在终端里跑了一条 `dig NS cnkirito.moe +short`：

```
wren.ns.cloudflare.com.
christian.ns.cloudflare.com.
```

NS 记录指向 Cloudflare，说明 DNS 解析完全由 Cloudflare 管理。域名注册商那边的设置已经不生效了。

然后我把 Cloudflare 的 API Token 给了 Qoder，它直接调用 Cloudflare REST API 查询了当前的 DNS 配置：

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq '.result[] | {type, name, content, proxied}'
```

```json
{ "type": "A", "name": "cnkirito.moe",     "content": "8.210.140.252", "proxied": true }
{ "type": "A", "name": "www.cnkirito.moe",  "content": "8.210.140.252", "proxied": true }
```

DNS 已经指向了新服务器 IP，Cloudflare 代理也是开启状态（橙色云朵），自动提供 HTTPS、CDN、DDoS 防护。

Qoder 自己用 `curl -I https://www.cnkirito.moe` 验证了一下，响应头里赫然写着 `server: cloudflare`。博客已经可以通过域名访问了。

> 这里有个认知上的转变：我以前管理 Cloudflare DNS 都是登录网页控制台点来点去，但 Qoder 天然就是一个 API 驱动的工具，REST API 对它来说比 Web UI 友好得多。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-04.png)

## Webhook：自动部署的最后一环

博客能访问了，但还差一个关键环节：**自动部署**。我希望推送 `source` 分支后，GitHub Actions 构建好 `master`，然后服务器自动拉取最新代码。

这个需求涉及到三个系统的联动：GitHub、Cloudflare、ECS 服务器。我跟 Qoder 讨论了几种方案，最终选定了一条干净的链路：

```
push source → GitHub Actions 构建 master → GitHub Webhook 回调
→ Cloudflare CDN → Nginx /hooks/ 路径 → webhook 服务 → git pull
```

### 服务器端：webhook 服务

Qoder 在服务器上安装了 [adnanh/webhook](https://github.com/adnanh/webhook)——一个 Go 写的轻量级 webhook 接收器，单二进制文件，内存占用约 11MB：

```bash
wget -q https://github.com/adnanh/webhook/releases/download/2.8.1/webhook-linux-amd64.tar.gz \
  -O /tmp/webhook.tar.gz
tar -xzf /tmp/webhook.tar.gz -C /usr/local/bin webhook-linux-amd64/webhook --strip-components=1
```

然后创建了 webhook 触发规则 `/etc/webhook/hooks.json`：

```json
[
  {
    "id": "deploy-blog",
    "execute-command": "/root/deploy-blog.sh",
    "command-working-directory": "/var/www/blog",
    "trigger-rule": {
      "and": [
        {
          "match": {
            "type": "payload-hmac-sha256",
            "secret": "<webhook-secret>",
            "parameter": { "source": "header", "name": "X-Hub-Signature-256" }
          }
        },
        {
          "match": {
            "type": "value",
            "value": "refs/heads/master",
            "parameter": { "source": "payload", "name": "ref" }
          }
        }
      ]
    }
  }
]
```

这里有两层校验：
1. **HMAC-SHA256 签名验证**：只接受持有 secret 的请求，防止伪造
2. **分支过滤**：只响应 `master` 分支的 push 事件

部署脚本 `/root/deploy-blog.sh` 很简单：

```bash
#!/bin/bash
set -e
cd /var/www/blog
git pull origin master
```

Webhook 服务用 systemd 管理，开机自启，异常 5 秒后自动重启。它只监听 `localhost:9000`，不直接暴露到公网。

### Nginx 路径转发

在博客的 Nginx 配置中加了一个 `/hooks/` 路径，转发到本地的 webhook 服务：

```nginx
location /hooks/ {
    proxy_pass http://127.0.0.1:9000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

这样外部请求 `https://www.cnkirito.moe/hooks/deploy-blog` 会经过 Cloudflare → Nginx 80 端口 → 本地 webhook:9000，全程不需要开放额外端口。

### GitHub 端：创建 Webhook

Qoder 直接用 `gh api` 在 GitHub 仓库上创建了 Webhook：

```bash
gh api repos/lexburner/lexburner.github.io/hooks --method POST \
  --input - << 'EOF'
{
  "name": "web",
  "active": true,
  "events": ["push"],
  "config": {
    "url": "https://www.cnkirito.moe/hooks/deploy-blog",
    "content_type": "json",
    "secret": "<webhook-secret>"
  }
}
EOF
```

一条命令，GitHub Webhook 就配好了。不需要打开浏览器、登录 GitHub、找到 Settings、点击 Webhooks、填表单。

### 验证

Qoder 在服务器上模拟了一个带签名的 push payload，webhook 成功触发，日志输出：

```
[webhook] deploy-blog hook triggered successfully
[webhook] executing /root/deploy-blog.sh
[webhook] command output: Deployed successfully at Mon Mar 23 02:23:40 PM CST 2026
```

整条链路跑通了。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-05.png)

## 复盘：Qoder 操作了哪些外部系统

回过头来看，这次实践中 Qoder 一共触达了 5 个外部系统：

| 系统 | 操作方式 | 做了什么 |
|------|----------|----------|
| 阿里云 ECS | SSH 远程执行 | 安装软件、创建配置、管理 systemd 服务 |
| Nginx | SSH 远程配置 | 虚拟主机、gzip、缓存策略、反向代理 |
| Cloudflare | REST API | 查询 DNS 记录、验证解析状态 |
| GitHub | gh CLI / API | 创建 Webhook、设置 Secrets |
| webhook 服务 | SSH 安装 + 配置 | 二进制安装、触发规则、systemd 服务 |

而整个过程中，我没有打开过任何一个网页控制台。没有登录 Cloudflare Dashboard，没有登录 GitHub Settings 页面，没有用 FTP 传文件。所有操作都在一个终端窗口里，通过对话完成。

想想上一次配服务器的经历：四五个终端窗口 + 浏览器来回切换 + 半天时间。而这次，同样的事情，一个 Qoder 对话窗口，从头到尾没有离开过。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-06.png)

## AI First：遇到事情先想想能不能用 AI 解决

配完这台服务器之后，我想聊一个更大的话题。

在大多数人的认知里，Qoder（或者说任何 AI Coding 工具）的定位是"帮我写代码"。写一个函数、改一个 bug、生成一段配置。但这篇文章记录的事情里，Qoder 没有写过一行业务代码——它做的全是运维操作：SSH 到服务器装软件、调 REST API 改 DNS、用 CLI 创建 Webhook。

**它可以操作你能 SSH 到的任何机器，调用任何有 API 的服务，串联任何可以通过命令行完成的工作流。**

SSH、REST API、CLI 工具，这三样东西几乎覆盖了一个开发者日常 90% 的操作场景。而 Qoder 恰好对这三样东西都有原生的支持。

回想一下我之前写的那篇 Quest 实践文章，当时的结论是"Qoder 结合 skill 可以操作整个 DevOps 环境"。那时候我的场景是 K8s 集群的压测任务编排，需要配合 Dockerfile、Helm Chart、推送脚本。而这次的博客部署，连 skill 都不需要配置——SSH、gh CLI、curl 调 API，这些都是开箱即用的能力。

所以我想通过这篇文章传达的是：

> **不要把 AI Coding 工具仅仅当成"写代码的助手"，它更像一个能理解自然语言的运维操作台。**

你描述目标，它去执行操作。写代码只是其中一种操作，安装软件、配置服务、调用 API、管理 DNS，这些都是操作。配服务器、搞 CI/CD、改 DNS、查日志、调接口——这些事情的共同点是：它们都有明确的输入和输出，都可以通过命令行完成，都可以被验证。

而一件事情只要具备可验证性，AI 就一定能搞定。

这才是 AI First 思维的真正含义——不是"用 AI 写代码"，而是"遇到任何事情，先想想能不能用 AI 解决"。代码只是其中一个子集。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-07.png)

## 彩蛋：这篇文章本身

写到这里，其实还有一件事没有交代。

服务器配好了，自动部署也跑通了，按理说故事应该结束了，回头一看 Qoder 的对话记录，发现整个过程听完整的，值得写一篇文章记录下来。而我平时写博客本来就会用 Qoder 辅助，所以这篇文章从初稿到定稿，也是在同一个对话窗口里完成的。

你可能会好奇：AI 写出来的文章不会一股 AI 味吗？这里有两个关键：一是我在项目里配了一个 `kirito-writing-style` 的 skill，把我的写作习惯沉淀成了规则；二是我就在博客仓库目录下写作，Qoder 可以直接读到我过去几年的所有文章，有充足的上下文来对齐风格。

不过 AI 写文章和写代码有一个很大的不同：代码有明确的对错，跑过测试就算完成；文章没有标准答案，"好不好"是一个主观判断。所以整个写作过程，与其说是 AI 在写，不如说是我在跟 AI 来回讨论。初稿出来之后改了好几轮——第一版把整件事写得好像我自己也被震撼到了，但其实我只是想平实地分享；第二版引言的起因写错了，我不是要"迁移博客"，而是旧服务器到期了；后边还有好几轮拉扯。这些细节 AI 不可能凭空知道，需要我来纠正。

最终你看到的这篇文章，大概是 AI 出了七成的框架和初稿，我调了三成的事实、措辞和语气。文章里的配图也是 Qoder 的 ImageGen 工具生成的，生成之后通过 PicGo CLI 直接上传到图床——连图片上传这种琐事都不用离开终端。这是我目前 AI 写作比较舒服的协作模式——让 AI 处理结构、表达、配图这些体力活，人来把控事实和品味。但这里面有一个前提：**你得往里面注入自己的灵魂。** 观点是你的、判断是你的、纠偏也是你的，AI 只是帮你把这些东西更高效地组织成文字。如果什么都不改直接发，那就不是 AI 辅助写作，而是 AI 注水——读者为什么要看一篇没有作者立场的文章呢？

所以这篇文章本身，就是 AI First 思维的又一次实践：配服务器用 AI，写配服务器的文章，还是用 AI。

![](https://image.cnkirito.cn/qoder-blog-build-practise-infographic-08.png)

## 最后

顺便提醒一句：整个过程中我给 AI 提供了 Cloudflare API Token、Webhook Secret、SSH 密钥等敏感凭证，这么做的前提是**这是个人服务器和个人博客，不涉及公司资产**。如果是公司项目，请务必评估合规要求和安全风险，AI First 不等于 AI Only。

可能有人会问：为什么不直接用 Vercel 或者 Cloudflare Pages，静态博客托管上去，连 Nginx 都不用配，Qoder 还内置 Vercel Deploy。原因很简单——Vercel 和 Cloudflare Pages 在国内访问都不太友好，前者没有国内节点，后者走的也是境外线路。我的读者大多在国内，速度和可达性是刚需。而且服务器已经买了，博客只是上面的一个站点，将来还可以跑其他服务，边际成本为零。

贴一下最终的部署架构，给需要的读者参考：

![](https://image.cnkirito.cn/qoder-blog-build-practise-architecture.png)

整个流程从推送源码到博客更新全自动，中间不需要任何人工干预。而搭建这一切，包括你正在读的这篇文章，都是在同一个 Qoder 对话窗口里完成的。

不多说了，`git push origin source`，等 Webhook 把这篇文章自动部署上去。
