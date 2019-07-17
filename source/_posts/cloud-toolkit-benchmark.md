---
title: IDEA 插件推荐：Cloud Toolkit 测评
date: 2019-06-27 19:19:41
tags:
- Cloud Toolkit
categories:
- 技术杂谈
---

## 产品介绍

[Cloud Toolkit](https://cn.aliyun.com/product/cloudtoolkit) 是一款 IDE 插件，帮助开发者更高效地开发、测试、诊断并部署应用。开发者能够方便地将本地应用一键部署到任意机器，或 ECS、EDAS、Kubernetes；并内置 Arthas 诊断、高效执行终端命令和 SQL 等。

对这款产品最直观的感受：这是一款发布工具，帮助用户在 IDE 中直接打包应用并部署到各种终端。原本看到其产品介绍位于阿里云的页面中，以为是一款和阿里云服务强绑定的产品，但试用过后发现，即使对于普通的云主机，其也非常适用，可以解决很多开发运维的痛点，非阿里云用户可以放心使用。

<!-- more -->

## 在 Cloud Toolkit 出现之前

作为一个 Java 程序员，我们现在大多数都会在 Intellij IDEA 中基于 SpringBoot 来开发 WEB 应用，所以本文中的测评将会基于如下架构

- 开发环境：IDEA
- 项目组织方式：Maven
- 开发框架：SpringBoot

来构建。在接触 Cloud Toolkit 之前，可以怎么部署一个 SpringBoot 应用呢？作为一个偏正经的测评人员，我不会为了凸显出 Cloud Toolkit 的强大而去翻出一些上古的部署工具来做对比，而是直接使用 Intellij IDEA 的内置功能与之对比。

### 第一步：配置服务器信息

在 `Tools -> Deployment` 中可以找到 IDEA 对项目部署支持的内置插件

![Deployment 插件](http://kirito.iocoder.cn/image-20190602181059808.png)

我们可以在其中进行服务器信息的配置，包括服务器地址和权限认证，并且在 Mapping 选项卡中完成本地工程与服务器路径的映射。

### 第二步：配置 Maven 打包插件

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

由于是 SpringBoot 应用，配置专用的打包插件后，可以将整个工程打成一个 fatjar，示例工程非常简单：

```java
@SpringBootApplication
@RestController
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @RequestMapping("/hello")
    public String hello() {
        return "hello world~~~~~~~~~~~~~~~~";
    }
}
```

之后，只要执行 install，即可得到一个可运行的 jar 包：

![打包](http://kirito.iocoder.cn/image-20190602181758619.png)

### 第三步：部署 jar 包

![部署](http://kirito.iocoder.cn/image-20190602181934176.png)

由于我们在第一步已经配置过项目路径与服务器路径的映射，可以选择直接对 fatjar 右键，upload 到远程服务器上。

### 第四步：启动应用

![启动](http://kirito.iocoder.cn/image-20190602182411907.png)

上图中展示的是 IDEA 中两个非常棒的内置功能，可以在 `Tools -> Start SSH session` 中开启远程服务器的终端，在 IDEA 下方可以执行远程指令；也可以在 `Tools -> Deployment ->Browse Remote Host ` 中展开如图右侧的结构，可视化地浏览服务器上的文件列表，检查应用是否部署成功。

在远程终端中，找到对应的 fatjar，执行 `java -jar spring-demo-1.0-SNAPSHOT.jar` 便完成了整个部署流程。

### IDEA 内置插件总结

IDEA 内置插件已经提供了相当强大的能力，整个部署过程我们完全没有离开 IDEA！避免了频繁切换窗口，装各种部署工具，可以说已经很方便了，Cloud Toolkit 必须要比这个部署过程做的更加强大才行，那下面就让我们来体验下 Cloud Toolkit 是怎么优化的吧。

## Cloud Toolkit 初体验

我们不急着用 Cloud Toolkit 来部署应用。虽然笔者是一位开发，但还是从产品的角度来研究下它的菜单项，看看它的产品定位。IDEA 安装插件的过程省略，详情可以参考 [《Intellij IDEA 安装 Cloud Toolkit 教程》](https://yq.aliyun.com/articles/674021)。

![多种部署方式](http://kirito.iocoder.cn/image-20190602183827891.png)

其他菜单项暂且抛到一边，这 5 个核心能力应该就是 Cloud Toolkit 的核心了。

即使作为一个插件小白，应该也能够望名知意，猜到这几个菜单对应的功能：

- Deploy to Host：部署到任意服务器。这一个功能决定了 Cloud Toolkit 强大的功能可以使得每个开发者受益，它其实并不是和阿里云厂商强绑定的。在下文也会重点测评下这个功能。
- Deploy to ECS：这里的 ECS 指的阿里云的 ECS，如果你的服务部署在阿里云 ECS 上，可以选择使用这个功能，获得比 Deploy to Host 更加丰富的功能。在下文我也会简单测评下这个功能。
- Deploy to EDAS，Deploy to EDAS Serverless：EDAS & EDAS Serverless 是阿里云上提供的分布式服务治理服务，可以理解为商业版的 Dubbo，具有强大的服务治理、服务调度能力，Cloud Toolkit 对 EDAS 做了个性化的部署支持，使得使用者无需登录控制台，在 IDEA 中即可完成 EDAS 的部署。
- Deploy to CS K8S：云原生时代很多应用使用容器化的方式进行部署，Cloud Toolkit 这一点做的还是不错的，已经具备了容器化部署的能力，具有一定的前瞻性。

其实从简单的功能介绍就可以看出，Cloud Toolkit 相比 IDEA 内置的部署能力的确是高出一大截了，甚至可以说，Deploy to Host 这一能力完全就可以覆盖 IDEA 插件的所有能力，并且对流程还进行了一些简化。下面我重点测评下 Deploy to Host 这一能力，与之前的部署流程进行一个对比。

## 使用 Cloud Toolkit 部署应用到任意服务器

![Deploy to Host](http://kirito.iocoder.cn/image-20190602185551351.png)

上图展示的 Deploy to Host 功能的配置项，实际上涵盖了

- 远程服务器配置
- 部署方式：Maven 构建，直接上传文件（目前还不支持 Gradle 构建，可能在后续的版本会支持）
- 本地文件与服务器路径的映射配置
- 启动脚本的集成

### 账号管理

SSH 登录账户可以在 `Preferences -> Alibaba Cloud Toolkit -> SSH Profile ` 中管理，找不到也没关系，需要设置的时候一般都会有超链接跳转，这点做得很人性化。

![SSH 账号管理](http://kirito.iocoder.cn/image-20190602190651881.png)

### 主机管理

服务信息可以在 `Tools -> Alibaba Cloud ->Alibaba Cloud View ` 中展开，如下图所示

![image-20190602191159882](http://kirito.iocoder.cn/image-20190602191159882.png)

### Deploy to Host

配置完账号信息和主机信息，然后只需要右键项目选择 `Alibaba Cloud -> Deploy to Host-> Run`  ，一切就搞定了。这个过程相比之前变得非常简易

- 不需要自己打包。Cloud Toolkit 集成了 Maven 插件。
- 不需要登录远程终端去执行脚本启动服务。Cloud Toolkit 提供了应用部署生命周期必要的钩子，只需要设置好启动脚本即可。
- 修改完本地代码，点击下 Deploy to Host，即可完成改动代码的部署。

经过如上的测评过程，相信即使没有使用过 Cloud Toolkit 的用户，也可以直观体会到这是怎么样一款插件了，并且它的功能是多么的实用。

## 使用 Cloud Toolkit 部署应用到 ECS

从产品设计的角度来分析，Cloud Toolkit 提供如此众多的部署能力，可以想到是其直接预设了使用人群。例如一个阿里云的 ECS 用户，在选择部署方式时，既可以使用 Deploy to Host 也可以使用 Deploy to ECS；例如一个 EDAS 用户，在选择部署方式时，既可以使用 Deploy to Host、Deploy to ECS，也可以使用 Deploy to EDAS（EDAS 可以理解为一个定制化的 ECS）。从产品的角度，越定制化的功能服务的人群越少，同时功能更强大；从用户体验的角度，其实也透露了云服务的一个特点，云厂商正在为其所提供的云服务提供更好的用户体验，借助于此类插件，可以降低使用者的开发运维门槛。

可以预见的一件事是，对于非阿里云用户来说，Deploy to Host 是使用 Cloud Toolkit 最大的诱惑了。作为一个测评文章，除了 Deploy to Host 之外，我还选择了 Deploy to ECS 这一功能来进行测评。为此我购买了一台阿里云的 ECS 来部署与上文相同的应用。

![Accounts](http://kirito.iocoder.cn/image-20190602194148035.png)

在阿里云控制台可以获取到账号的 Access Key/Access Key Secret，在 IDEA 中的 `Preferences -> Alibaba Cloud Toolkit -> Accounts` 中可以设置账号。

在账号设置完毕后，Cloud Toolkit 看起来是通过内置的 API 直接关联到了我的 ECS 实例，在选择部署时，可以直接根据 region 选择实例列表中的机器进行部署。

![实例列表](http://kirito.iocoder.cn/image-20190602194439453.png)

其余的部署流程和 Deploy to Host 相差无几。也就是说，Deploy to ECS 更多的其实完成了权限管理和主机管理，ECS 用户使用这个功能就显得非常高效了。

## Cloud Toolkit 的亮点功能

Cloud Toolkit 除了主打的部署能力，还提供了不少亮点功能，我选择了其中的 3 个功能：上传文件，远程 Terminal，内置应用诊断功能来进行评测。

### 上传文件

![upload](http://kirito.iocoder.cn/image-20190604201842718.png)

有些脚本我们希望在本地编辑之后上传到服务器上，Cloud Toolkit 对每一个主机都提供了一个 Upload 操作，可以将本地的文件上传到远程主机上，并且还可以触发一个 commond，这个功能也是很人性化的，因为上传脚本后，往往需要运行一次，避免了我们再登录到远程主机上执行一次运行操作。

### 远程 Terminal

特别是在 Mac 中，我一直苦恼的一件事便是如何管理众多的远程机器，我需要偶尔去搭建了博客的主机上查看下个人博客为什么挂了，偶尔又要去看看我的 VPN 主机排查下为什么无法转发流量了，在开发测试阶段，又要经常去测试主机上简单的执行一些命令。所有这一切通过 ssh 工具去完成都不麻烦，但所有的麻烦事集合到一起时往往会让我变得焦头烂额，这一点，Cloud Toolkit 简直是一个 Life Saver。

![image-20190604201228263](http://kirito.iocoder.cn/image-20190604201228263.png)

事实上，在前面的测评中我们已经了解到 IDEA 内置了远程 Terminal 这个功能，Cloud Toolkit 是进一步优化了它的体验，用户可以直接在可视化的页面选择想要远程登录的主机，在对主机加了 Tag 之后，这个过程会更加直观。

### 内置应用诊断功能

在测评体验过程中，意外地发现了 Cloud Toolkit 的一个功能支持，就是前面的截图有显示，但我未提到的 Diagnostic （诊断）功能。Cloud Toolkit 集成了阿里巴巴开源的一款应用诊断框架 -- [Arthas](https://alibaba.github.io/arthas/)。

- 对于本地主机，可以直接通过 `Tools -> Alibaba Cloud -> Diagnostic Tools` 开启诊断。
- 对于远程主机，可以通过主机管理中的 Diagnostic 选项卡，开启远程诊断。

![远程诊断](http://kirito.iocoder.cn/image-20190602195455602.png)

在过去，我们想要进行诊断，必须要手动在服务器上安装 Arthas，Cloud Toolkit 借助于 Remote Terminal 和 Arthas 的集成，让这一切都可以在 IDEA 中完成，似乎是想要贯彻：彻底杜绝第三方工具，一切都用插件完成。

当你遇到以下类似问题而束手无策时，`Arthas` 可以帮助你解决：

1. 这个类从哪个 jar 包加载的？为什么会报各种类相关的 Exception？
2. 我改的代码为什么没有执行到？难道是我没 commit？分支搞错了？
3. 遇到问题无法在线上 debug，难道只能通过加日志再重新发布吗？
4. 线上遇到某个用户的数据处理有问题，但线上同样无法 debug，线下无法重现！
5. 是否有一个全局视角来查看系统的运行状况？
6. 有什么办法可以监控到 JVM 的实时运行状态？

作为一个偏正经的评测，我们试用一下远程诊断的功能，选取比较直观的 trace 命令来进行评测

![慢应用](http://kirito.iocoder.cn/image-20190604194749595.png)

如上图所示，我们构造了一个慢请求，其中 invokeServiceA_B() 相对于其他方法十分耗时，我们希望通过 Cloud Toolkit 定位到慢调用的源头，找出 invokeServiceA_B 这个罪魁祸首。

![arthas](http://kirito.iocoder.cn/image-20190602200009029.png)

点击 IDEA 中对应部署服务器的 Diagnostic 菜单项，就会出现如上图所示的一个 Arthas 诊断页面，它会自动关联到用户的 Java 进程，用户只需要选择相应诊断的进程即可。

![image-20190604200009328](http://kirito.iocoder.cn/image-20190604200009328.png)

在关联到相应的进程之后，我们执行 trace 指令 

`trace moe.cnkirito.demo.Application * -j`

这个指令的含义是当 `moe.cnkirito.demo.Application` 中的任意方法被触发调用后，会打印出相应的调用栈，并计算耗时，`-j` 的含义是过滤掉 JDK 内置的类，简化堆栈。正如上图所示，我们定位到是 invokeServiceA 的 invokeServiceA_B 最为耗时。用户可以自行监控对应的方法，把 * 替换为想要监控的方式即可。更多的监控指令可以参考：[Arthas 文档](https://alibaba.github.io/arthas/)

## 测评中发现的不足

是软件就必然有 bug，或者是用户体验不好的地方，花费了一个下午进行测评，简单罗列下我认为的缺陷。

### 远程连接容易出现异常

这个问题不是特别容易复现，表现是长时间运行项目后，再部署，会提示远程连接失败，在重启 IDEA 之后可以解决这个问题，原因未知。在后面想要复现时一直无法复现，但的确耗费了我很长的时间，不知道有没有其他的用户遇到同样的问题。

### 文件浏览器过于简陋

![ssh](http://kirito.iocoder.cn/image-20190602200447655.png)

当尝试配置 SSH 公私钥以实现免密登录时，发现 Browse 打开的文件浏览器无法正常显示 Mac 中的 .ssh 隐藏文件夹，大多数情况下用户会将 SSH 公私钥存放在 ~/.ssh 中，这个用户体验不是很好，或许有办法在这个文件浏览器中访问到隐藏文件夹，但至少我还没找到方法。

### 缺少远程主机的可视化功能

IDEA 的默认插件支持 Remote Host

![Remote Host](http://kirito.iocoder.cn/image-20190602200927981.png)

这个可以提升用户体验，Cloud Toolkit 提供了远程主机的管理，额外实现一个 ftp 协议可能会更方便用户查看自己的部署结果。从连接协议的选择上也可以发现，Cloud Toolkit 目前只支持 sftp 协议，而 IDEA 内置的 Deployment 插件还支持 ftp、ftps 等方式。

## 产品定位&评价&竞品

其实本文基本是围绕 IDEA 的内置 Deployment 顺带着 Cloud Toolkit 的测评一起进行的。实际上我并不觉得 Cloud Toolkit 存在什么竞品

xftp 或者 xshell 吗？它们只是一款 ssh 工具罢了，人家压根没想着跟你竞争。

jenkins 吗？jenkins 有自己的 devops 流程，侧重在持续集成，而 Cloud Toolkit 定位是在日常开发中完成部署验证等行为。

在我的测评过程中，能够感受到这款产品的匠心，几乎为所有用户可能遇到的问题都做配备了文档：不知道启动脚本怎么写？链接了常用的 Java 应用启动脚本；不清楚该使用哪种部署方式？每种方式都有完整的部署文档；多语言？同时提供了 Go、NodeJS 的部署案例...

同时还支持了一些赠品功能：查看实时日志，文件上传，SQL 执行等。

以个人愚见，聊聊这款产品的定位，一方面是云厂商无关的特性，Cloud Toolkit 提供了 Deploy to Host、内置 Arthas 诊断等功能，造福了广大的开发者，另一方面是阿里云服务绑定的一些功能，Cloud Toolkit 为 ECS、EDAS 用户带来了福音，可以享受比普通应用部署更加便捷的操作。前者为 Cloud Toolkit 积累了业界口碑，后者为阿里云付费用户增加了信心，同时也为潜在的阿里云用户埋下了种子。