---
title: 构建多系统架构支持的 Docker 镜像
toc: true
type: 1
date: 2022-04-18 19:03:06
category:
- 技术杂谈
tags:
- 技术杂谈
---

## 前言

陪伴了我 3 年的 Mac 在几个月前迎来了它的退休时刻，我将其置换成了公司新发的 Mac M1。对电子产品并不太感冒的我，并没有意识到 M1 是 ARM 架构的（除了个别软件的安装异常之外），显然，Mac M1 做的是不错的，我并没有太多吐槽它的机会。这也是我第一次近距离接触 ARM 架构的机会。

很快，在工作上，我遇到了第二次跟 ARM 打交道的机会。我们越来越多的客户，开始选择 ARM 架构的服务器作为 IaaS 层资源，这给我们的交付带来了一些工作量。适配工作中比较重要的一环便是 Docker 镜像，需要产出支持 ARM 架构的版本。

本文主要记录笔者在构建多系统架构支持的 Docker 镜像时的一些经验，以及一些个人的理解。

<!-- more -->

## 前置知识点

### CPU 架构

主流的 CPU 架构就两类：x86 和 ARM。但在发展过程中，他们的命名并不一定都是如此。例如 amd64、x86_64 指的都是 x86 的 64 位架构，arm64v8、aarch64、arm64 指的都是 ARM 的 64 位架构。

![image-20220418192901660](https://kirito.iocoder.cn/image-20220418192901660.png)

在 docker hub 中，主流的镜像都列出了支持的架构，你也可以通过 Architectures 来进行镜像筛选。

### docker buildx

在 docker buildx 出现之前，我们只能通过 docker build 来构建镜像。顾名思义，docker buildx 是对 docker 构建能力的一个扩展，它最大的一个亮点便是对多系统架构构建的支持。

> docker buildx 适用于 Docker v19.03+ 版本

一个 docker buildx 的构建示例：

```shell
docker buildx build -t cop/cop-demo --platform linux/amd64 .
```

我们将在下文详细介绍这一命令。

### docker manifest

docker manifest 清单，该功能仍处于实验性阶段，也是多系统架构构建的一个关键命令。其可以让我们了解一个镜像的分层信息、大小、签名，最关键的，他可以让我们了解该镜像支持的架构信息。

```shell
~ docker manifest inspect openjdk
{
   "schemaVersion": 2,
   "mediaType": "application/vnd.docker.distribution.manifest.list.v2+json",
   "manifests": [
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 954,
         "digest": "sha256:afbe5f6d76c1eedbbd2f689c18c1984fd67121b369fc0fbd51c510caf4f9544f",
         "platform": {
            "architecture": "amd64",
            "os": "linux"
         }
      },
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 954,
         "digest": "sha256:0722e5cd28b8834d2c2e6a3659ba4631c6f6aea6aa88361feff58032bb3514e3",
         "platform": {
            "architecture": "arm64",
            "os": "linux",
            "variant": "v8"
         }
      },
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 2983,
         "digest": "sha256:5ecbb996abc91a17257ae0192f2b69a0a3096279a5b9167aef656d6b88972b65",
         "platform": {
            "architecture": "amd64",
            "os": "windows",
            "os.version": "10.0.20348.643"
         }
      },
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 2983,
         "digest": "sha256:702402cac2a4e078ec1df8aa23e0f13c7155621dffc520e5ac21e44d94d9ca76",
         "platform": {
            "architecture": "amd64",
            "os": "windows",
            "os.version": "10.0.17763.2803"
         }
      }
   ]
}
```

platform 一栏，使我们最关注的架构支持信息。

![image-20220419134556554](https://kirito.iocoder.cn/image-20220419134556554.png)

对比 digest 信息，可以发现和 docker hub 的信息是一致的。

### 本文环境说明

本文所有操作基于 Mac M1，Docker Desktop 进行。相关操作可能涉及 experiment 和 buildkit 特性，需要开启。我的配置参考：

```json
{
  "features": {
    "buildkit": true
  },
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  },
  "experimental": true
}
```

## 拉取多架构镜像

在没有使用 Mac M1 / ARM 架构之前，拉取镜像似乎并没有那么多烦恼。

```shell
docker pull openjdk
```

从前文可以得知，openjdk 在不同架构下有不同的 digest，docker 会自行判断当前机器的架构，拉取对应架构的版本。例如 Mac M1 上我拉取的便是 arm64 的版本：

```shell
~ docker image inspect openjdk | grep Arch
        "Architecture": "arm64",
```

我们也可以通过 --platform 参数来指定拉取的操作系统&架构对应的镜像

```shell
docker pull --platform linux/amd64 openjdk
```

同一个镜像 tag，本地只会保存一份，再次查看本地镜像的架构信息，已经是 amd64 了：

```shell
~ docker image inspect openjdk | grep Arch
        "Architecture": "amd64",
```

hub 端支持根据按照 Arch 存储多份镜像，实际借助了 manifest 等机制，但并不是所有镜像都支持了 manifest，这也意味着， `--platform` 参数并不适用于所有镜像，你可以通过 `docker manifest inspect` 确认镜像的 Arch 支持情况。

## 构建多架构镜像

在调研构建多架构镜像方案时，我有不少困惑，也踩过不少坑，最终我采用的是 docker buildx 构建多架构镜像，并通过 docker manifest 合并清单列表的方案。

### 寻找支持多架构的 parent 镜像

以 openjdk 为例，其提供了 arm64 和 amd64 的版本，我们就用它来做 demo。

Java demo：

```java
public class Main {

    public static void main(String[] args) {
        System.out.println("hello world");
    }

}
```

Dockerfile:

```dockerfile
FROM openjdk:17
COPY . /usr/src/myapp
WORKDIR /usr/src/myapp
RUN javac Main.java
CMD ["java", "Main"]
```

### 本地构建多架构镜像

```shell
~ docker buildx inspect --bootstrap
Name:   default
Driver: docker

Nodes:
Name:      default
Endpoint:  default
Status:    running
Platforms: linux/arm64, linux/amd64, linux/riscv64, linux/ppc64le, linux/s390x, linux/386, linux/arm/v7, linux/arm/v6
```

docker buildx 默认的构建器支持构建 linux/arm64, linux/amd64 等操作系统 & 架构的镜像。Docker 通过交叉构建实现该能力，所以并不限制于构建机器的 CPU 架构。

而 docker buildx 支持 `--platform` 参数，该参数可以指定构建镜像的操作系统 & CPU 架构

```shell
docker buildx build -t kiritomoe/java-multi-arch-demo:1.0-aarch64 --platform linux/arm64 -o type=docker .
docker buildx build -t kiritomoe/java-multi-arch-demo:1.0-x86_64 --platform linux/amd64 -o type=docker .
```

### 创建推送 Manifest 清单

在上一步中，其实我们已经构建了多架构的镜像，但此时，不同架构对应了不同的 tag，这与我们熟悉的 openjdk 的方案还有些差别。openjdk 等镜像实现同一个 tag 绑定多架构版本正是使用了 docker manifest。

 ```shell
 docker manifest create kiritomoe/java-multi-arch-demo:1.0 kiritomoe/java-multi-arch-demo:1.0-x86_64 kiritomoe/java-multi-arch-demo:1.0-aarch64
 docker manifest push kiritomoe/java-multi-arch-demo:1.0
 docker manifest rm kiritomoe/java-multi-arch-demo:1.0
 ```

注意最终推送的是 kiritomoe/java-multi-arch-demo:1.0 该 manifest，并没有推送其他镜像。并且在 manifest 推送之后，需要删除本地副本，这使得我们今后在本地执行诸如 `docker manifest inspect kiritomoe/java-multi-arch-demo:1.0` 等操作时，确保是从远程仓库加载的，manifest 只有存在于远程仓库，才有意义。

### 查看远程仓库的多架构镜像

![image-20220419205806986](https://kirito.iocoder.cn/image-20220419205806986.png)

成功将多架构绑定到了同一个 tag。

使用命令行查看 

```shell
~ docker manifest inspect kiritomoe/java-multi-arch-demo:1.0
{
   "schemaVersion": 2,
   "mediaType": "application/vnd.docker.distribution.manifest.list.v2+json",
   "manifests": [
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 1574,
         "digest": "sha256:6cceb21f1a225c9f309f51413fdb7cf8d8ea3980a832c84c07ce3e30fed41628",
         "platform": {
            "architecture": "arm64",
            "os": "linux"
         }
      },
      {
         "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
         "size": 1574,
         "digest": "sha256:0dddf9a86e60de3fd56d074a8f535a90e391b35a6e503fedd09f87c8c32ca75a",
         "platform": {
            "architecture": "amd64",
            "os": "linux"
         }
      }
   ]
}
```

## 一些谈不上最佳实践的实践

如果你调研过多架构方案的支持，会发现其实上述的方案并不是唯一的支持方案，个人精力也有限，我没有详细考究 docker 对多架构支持的发展历史，要不是项目需要，天知道我竟然花了两天时间在研究这些东西。但上述的方案是我目前总结下来最简单的方案。

尽管 docker 实现了根据编译机器自动拉取适合本机的镜像，但该能力并不适用于所有的情况。例如

1. 构建机器无法把控，那编译这一行为也将会变得不可控。
2. 构建机器并不一定是最终运行镜像的机器
3. 本地构建的测试开发场景

要想让这一切尽在掌控之中，我个人的建议是遵循两个原则：

1. 业务镜像提供 multi-arch 支持。例如我的基础镜像选择了 centos（centos 是支持 multi-arch 的），我的本地环境是 Mac M1，而我们公司的构建机器是 x86，并不是每个人都是 docker 专家，我希望 `From centos` 这个拉取镜像的策略变的可控，我愿意为之而编写两个 Dockerfile: Dockerfile_amd64 和 Dockerfile_arm64。最终对我的两个制品进行 manifest 合并，实现 multi-arch。
2. 其他通用镜像支持 multi-arch 的同时，提供不同 Arch 的 tag。例如业务场景中，一般需要提供几类基础镜像
   - 适用于 java 应用的基础镜像：java-base:1.0、java-base:1.0-aarch64、java-base:1.0-x86_64
   - 适用于前端应用的基础镜像：nginx-base:1.0、nginx-base:1.0-aarch64、nginx-base:1.0-x86_64
   - 适用于通用应用的基础镜像：centos-base:1.0、centos-base:1.0-aarch64、centos-base:1.0-x86_64

尽管我清楚可以通过 sha256 精准拉取到指定 Arch 的镜像，但会徒增很多理解成本。

## 参考

- [docker docs](https://docs.docker.com/buildx/working-with-buildx/)

