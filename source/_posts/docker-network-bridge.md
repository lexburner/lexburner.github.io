---
title: Docker Network—Bridge 模式
date: 2018-04-03 22:56:45
tags:
- Docker
- Network
categories:
- Docker
---

### 概述

Docker 强大的原因之一在于多个 Docker 容器之间的互相连接。涉及到连接，就引出了网络通信的几种模式。Docker 默认提供了 5 种网络驱动模式。
<!-- more -->
- bridge:	默认的网络驱动模式。如果不指定驱动程序，bridge 便会作为默认的网络驱动模式。当应用程序运行在需要通信的独立容器 (standalone containers) 中时，通常会选择 bridge 模式。
- host：移除容器和 Docker 宿主机之间的网络隔离，并直接使用主机的网络。host 模式仅适用于 Docker 17.06+。
- overlay：overlay 网络将多个 Docker 守护进程连接在一起，并使集群服务能够相互通信。您还可以使用 overlay 网络来实现 swarm 集群和独立容器之间的通信，或者不同 Docker 守护进程上的两个独立容器之间的通信。该策略实现了在这些容器之间进行操作系统级别路由的需求。
- macvlan：Macvlan 网络允许为容器分配 MAC 地址，使其显示为网络上的物理设备。 Docker 守护进程通过其 MAC 地址将流量路由到容器。对于希望直连到物理网络的传统应用程序而言，使用 macvlan 模式一般是最佳选择，而不应该通过 Docker 宿主机的网络进行路由。
- none：对于此容器，禁用所有联网。通常与自定义网络驱动程序一起使用。none 模式不适用于集群服务。

通过在 Docker 上安装和使用第三方网络插件可以算作额外的扩展方式。

### 默认网络

```Shell
kiritodeMacBook-Pro:~ kirito$ docker network ls
NETWORK ID          NAME                         DRIVER              SCOPE
15315759c263        bridge                       bridge              local
d72064d9febf        host                         host                local
83ea989d3fec        none                         null                local
```

这 3 个网络包含在 Docker 实现中。运行一个容器时，可以使用 **--network** 参数指定在哪种网络模式下运行该容器。

这篇文章重点介绍 bridge 模式。 所有 Docker 安装后都存在的 docker0 网络，这在 Docker 基础中有过介绍。除非使用 **docker run --network=<NETWORK>** 选项另行指定，否则 Docker 守护进程默认情况下会将容器连接到 docker0 这个网络。

### 创建自定义的网络

使用如下命令就可以创建一个名称为 my-net ，网络驱动模式为 bridge 的自定义网络。

```shell
$ docker network create my-net
```

再次查看存在的网络可以发现上述命令执行之后产生的变化：

```shell
kiritodeMacBook-Pro:~ kirito$ docker network ls
NETWORK ID          NAME                         DRIVER              SCOPE
15315759c263        bridge                       bridge              local
d72064d9febf        host                         host                local
73e32007f19f        my-net                       bridge              local
83ea989d3fec        none                         null                local
```

### 使用 busybox 测试容器连通性

> BusyBox 是一个集成了一百多个最常用 Linux 命令和工具（如 cat、echo、grep、mount、telnet 、ping、ifconfig 等）的精简工具箱，它只需要几 MB 的大小，很方便进行各种快速验证，被誉为“Linux 系统的瑞士军刀”。

我们使用 busybox 来测试容器间的网络情况。(一开始我尝试使用 ubuntu 作为基础镜像来构建测试容器，但 ubuntu 镜像删减了几乎所有的常用工具，连同 ping，ifconfig 等命令都需要额外安装软件，而 busybox 则不存在这些问题。)

#### 使用默认网桥 docker0

```shell
kiritodeMacBook-Pro:~ kirito$ docker run --name box1 -it --rm busybox sh
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:07
          inet addr:172.17.0.7  Bcast:172.17.255.255  Mask:255.255.0.0
```

—rm 指令可以让我们在退出容器时自动销毁该容器，这样便于测试。查看自身的 ip 为 172.17.0.7，接下来创建第二个容器 box2。

```shell
kiritodeMacBook-Pro:~ kirito$ docker run --name box2 -it --rm busybox sh
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:08
          inet addr:172.17.0.8  Bcast:172.17.255.255  Mask:255.255.0.0
```

查看自身的 ip 为 172.17.0.8。

在 box2 中执行 ping 命令测试与 box1 的连通性：

```shell
使用 IP
/ # ping 172.17.0.8
PING 172.17.0.8 (172.17.0.8): 56 data bytes
64 bytes from 172.17.0.8: seq=0 ttl=64 time=0.107 ms
64 bytes from 172.17.0.8: seq=1 ttl=64 time=0.116 ms
64 bytes from 172.17.0.8: seq=2 ttl=64 time=0.114 ms
64 bytes from 172.17.0.8: seq=3 ttl=64 time=0.126 ms

使用容器名称
/ # ping box1
无响应
```

我们发现使用默认网桥 docker0 的桥接模式下，ip 是通的，但是无法使用容器名作为通信的 host。

#### 使用自定义网桥 my-net

```shell
kiritodeMacBook-Pro:~ kirito$ docker run --name box3 -it --rm  --network my-net busybox sh
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:00:02
          inet addr:172.21.0.2  Bcast:172.21.255.255  Mask:255.255.0.0
```

使用 `—network` 指定使用的网络模式，`my-net` 便是在此之前我们通过 `docker network create` 命令新创建的网络。新启动一个 shell 创建 box4

```shell
kiritodeMacBook-Pro:~ kirito$ docker run -it --name box4 --rm --network my-net busybox sh
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:00:03
          inet addr:172.21.0.3  Bcast:172.21.255.255  Mask:255.255.0.0
```

在 box4 中执行 ping 命令测试与 box3 的连通性：

```shell
使用 IP
/ # ping 172.21.0.2
PING 172.21.0.2 (172.21.0.2): 56 data bytes
64 bytes from 172.21.0.2: seq=0 ttl=64 time=0.203 ms
64 bytes from 172.21.0.2: seq=1 ttl=64 time=0.167 ms
64 bytes from 172.21.0.2: seq=2 ttl=64 time=0.169 ms
64 bytes from 172.21.0.2: seq=3 ttl=64 time=0.167 ms

使用容器名称
/ # ping box3
PING box3 (172.21.0.2): 56 data bytes
64 bytes from 172.21.0.2: seq=0 ttl=64 time=0.229 ms
64 bytes from 172.21.0.2: seq=1 ttl=64 time=0.170 ms
64 bytes from 172.21.0.2: seq=2 ttl=64 time=0.165 ms
64 bytes from 172.21.0.2: seq=3 ttl=64 time=0.168 ms
```

与默认的网络 docker0 不同的是，指定了自定义 network 的容器可以使用容器名称相互通信，实际上这也是 docker 官方推荐使用 `—network` 参数运行容器的原因之一。

### 对比自定义 bridge(my-net) 与默认 bridge(docker0) 

#### 自定义 bridge 提供更好的隔离性和容器间的互操作性

连接到同一个自定义 bridge 网络的容器会自动将所有端口相互暴露，并且无法连接到容器之外的网络。这使得容器化的应用能轻松地相互通信，并且与外部环境产生了良好的隔离性。

例如一个包含了 web 应用，数据库，redis 等组件的应用程序。很有可能只希望对外界暴露 80 端口，而不允许外界访问数据库端口和 redis 端口，而又不至于让 web 应用本身无法访问数据库和 redis， 便可以使用自定义 bridge 网络轻松实现。如果在默认 bridge 网络上运行相同的应用程序，则需要使用 -p 或 —publish 标志打开 web 端口，数据库端口，redis 端口。这意味着 Docker 宿主机需要通过其他方式阻止对数据库端口，redis 端口的访问，无意增大了工作量。

#### 自定义 bridge 提供容器间的自动 DNS 解析

这一点在上一节的实验中已经验证过了。默认 bridge 网络上的容器只能通过 IP 地址互相访问，除非使用在 docker run 时添加 `—link` 参数。这么做个人认为有两点不好的地方：

一：容器关系只要稍微复杂一些，便会对管理产生不便。

二： `—link` 参数在官方文档中已经被标记为过期的参数，不被建议使用。

在用户定义的桥接网络上，容器可以通过容器名称 (`--name` 指定的名称) 或别名来解析对方。可能有人说，在默认 bridge 模式下我可以去修改 `/etc/hosts` 文件呀，但这显然不是合理的做法。

#### 容器可以在运行中与自定义 bridge 网络连接和分离

在容器的生命周期中，可以在运行中将其与自定义网络连接或断开连接。 而要从默认 bridge 网络中移除容器，则需要停止容器并使用不同的网络选项重新创建容器。

#### 每个自定义的 bridge 网络都会创建一个可配置的网桥

如果容器使用默认 bridge 网络，虽然可以对其进行配置，但所有容器都使用相同的默认设置，例如 MTU 和防火墙规则。另外，配置默认 bridge 网络隔离于 Docker 本身之外，并且需要重新启动 Docker 才可以生效。

自定义的 bridge 是使用 docker network create 创建和配置的。如果不同的应用程序组具有不同的网络要求，则可以在创建时分别配置每个用户定义的 bridge 网络，这无疑增加了灵活性和可控性。

#### 使用默认 bridge 容器共享所有的环境变量

在 Docker 的旧版本中，两个容器之间共享环境变量的唯一方法是使用 `—link` 标志来进行链接。这种类型的变量共享对于自定义的网络是不存在的。但是，自定义网络有更好方式来实现共享环境变量：

- 多个容器可以使用 Docker 卷来挂载包含共享信息的文件或目录。
- 多个容器可以使用 docker-compose 一起启动，并且 docker-compose.yml 文件可以定义共享变量。
- 使用集群服务而不是独立容器，并利用共享密钥和配置。

结合上述这些论述和官方文档的建议，使用 bridge 网络驱动模式时，最好添加使用 `—network` 来指定自定义的网络。

### 参考资料

https://docs.docker.com/network/bridge/#connect-a-container-to-the-default-bridge-network

https://www.ibm.com/developerworks/cn/linux/l-docker-network/index.html
