---
title: 使用 JMeter 进行 Dubbo 性能测试
date: 2019-09-05 19:45:52
tags:
- DUBBO
- JMeter
categories:
- RPC
---

## 1 前言

说道性能测试工具，你会立刻联想到哪一个？ab（ApacheBench）、JMeter、LoadRunner、wrk…可以说市面上的压测工具实在是五花八门。那如果再问一句，对 Dubbo 进行性能压测，你会 pick 哪一个？可能大多数人就懵逼了。可以发现，大多数的压测工具对开放的协议支持地比较好，例如：HTTP 协议，但对于 Dubbo 框架的私有协议：`dubbo`，它们都显得力不从心了。

如果不从通用的压测工具上解决 Dubbo 的压测需求问题，可以自己写 Dubbo 客户端，自己统计汇总结果，但总归不够优雅，再加上很多开发同学没有丰富的测试经验，很容易出现一些偏差。说到底，还是压测工具靠谱，于是便引出了本文的主角 —— **[jmeter-plugins-for-apache-dubbo](https://github.com/thubbo/jmeter-plugins-for-apache-dubbo)**。这是一款由 Dubbo 社区 Commiter -- [凝雨](https://ningyu1.github.io/blog/about/) 同学开发的 JMeter 插件，可以非常轻松地对 Dubbo 实现性能测试。

<!-- more -->

## 2 JMeter 介绍

在开始压测 Dubbo 之前，先简单介绍一下这款开源的性能测试工具 —— JMeter。JMeter 是 Apache 组织基于 Java 开发的一款性能测试工具。它最初被设计用于 Web 应用测试，但后来扩展到其他测试领域，并可以在 Windows、Mac、Linux 环境下安装使用。JMeter 还提供了图形界面，这使得编写测试用例变得非常简单，具有易学和易操作的特点。

> JMeter 官网：http://jmeter.apache.org/download_jmeter.cgi

### 2.1 安装 JMeter

截止本文发布，官方的最新版本为：[apache-jmeter-5.1.1.zip](http://mirrors.tuna.tsinghua.edu.cn/apache//jmeter/binaries/apache-jmeter-5.1.1.zip) , 下载后直接解压即可。

![jmeter 目录](https://kirito.iocoder.cn/image-20190905204943326.png)

在 ${JMETER_HOME}/bin 下找到启动脚本，可以打开图形化界面

- Mac/Linux 用户可以直接使用 jmeter 可执行文件，或者 jmeter.sh 启动脚本
- Windows 用户可以使用 jmeter.bat 启动脚本

### 2.2 命令行提示信息

启动过程中会有一段命令行日志输出：

```shell
================================================================================
Don't use GUI mode for load testing !, only for Test creation and Test debugging.
For load testing, use CLI Mode (was NON GUI):
   jmeter -n -t [jmx file] -l [results file] -e -o [Path to web report folder]
& increase Java Heap to meet your test requirements:
   Modify current env variable HEAP="-Xms1g -Xmx1g -XX:MaxMetaspaceSize=256m" in the jmeter batch file
Check : https://jmeter.apache.org/usermanual/best-practices.html
================================================================================
```

注意到第一行的提示，GUI 仅仅能够用于调试和创建测试计划，实际的性能测试需要使用命令行工具进行。

`jmeter -n -t [jmx file] -l [results file] -e -o [Path to web report folder]`

- 【jmx file】：使用 GUI 创建的测试计划文件，后缀名为 `.jmx`
- 【results file】：测试结果文本文件输出路径
- 【Path to web report folder】：测试报告输出路径，JMeter 的强大之处，可以生成图文并茂的测试报告

### 2.3 GUI 界面展示

![image-20190905211412101](https://kirito.iocoder.cn/image-20190905211412101.png)

上图所示为 JMeter 的主界面。官方提供了国际化支持，通过 【Options】->【Choose Language】可以将界面语言变更为简体中文。

## 3 JMeter 压测 HTTP

本节以 JMeter 压测 HTTP 为引子，介绍 JMeter 的使用方式，让没有使用过 JMeter 的读者对这款工具有一个较为直观的感受。

### 3.1 创建线程组

在“测试计划”上右键 【添加】-->【线程（用户）】-->【线程组】。

![image-20190905211637435](https://kirito.iocoder.cn/image-20190905211637435.png)

给线程组起一个名字，方便记忆。

![image-20190905211831670](https://kirito.iocoder.cn/image-20190905211831670.png)

- 线程数：决定了由多少线程并发压测
- Ramp-Up：代表了 JMeter 创建所有线程所需要的时间，如图所示则代表每 0.1s 创建一个线程
- 循环次数：在运行所设置的次数之后，压测将会终止。如果想要运行固定时长的压测，可以设置为：永远，并在下面的调度器中指定持续时间

### 3.2 增加 HTTP 取样器

在刚刚创建的线程组上右键 【添加】-->【取样器】-->【HTTP 请求】。

![image-20190905211606505](https://kirito.iocoder.cn/image-20190905211606505.png)

为 HTTP 取样器配置上压测地址和必要的参数

![image-20190905212937824](https://kirito.iocoder.cn/image-20190905212937824.png)

### 3.3 添加察看结果树

在刚刚创建的线程组上右键 【添加】-->【监听器】-->【察看结果树】。

![image-20190905213114409](https://kirito.iocoder.cn/image-20190905213114409.png)

只有添加了【察看结果树】才能让我们看到 GUI 中测试的结果。

### 3.4 准备 HTTP Server

使用 SpringBoot 可以快速构建一个 RestController，其暴露了 `localhost:8080/queryOrder/{orderNo}` 做为压测入口

```java
@RestController
public class OrderRestController {

    @Autowired
    OrderService orderService;

    @RequestMapping("/queryOrder/{orderNo}")
    public OrderDTO queryOrder(@PathVariable("orderNo") long orderNo) {
        return orderService.queryOrder(orderNo);
    }

}
```

被压测的服务 OrderService ：

```java
@Component
public class OrderService {

    public OrderDTO queryOrder(long orderNo) {
        OrderDTO orderDTO = new OrderDTO();
        orderDTO.setOrderNo(orderNo);
        orderDTO.setTotalPrice(new BigDecimal(ThreadLocalRandom.current().nextDouble(100.0D)));
        orderDTO.setBody(new byte[1000]);
        return orderDTO;
    }
}
```

### 3.5 验证结果

 在刚刚创建的线程组上右键 【验证】，执行单次验证，可以用来测试与服务端的连通性。在【察看结果树】选项卡中可以看到【响应数据】已经正常返回了。

![image-20190905214317033](https://kirito.iocoder.cn/image-20190905214317033.png)

### 3.6 执行测试计划

还记得之前启动 GUI 时控制台曾经提示过我们，GUI 只负责创建测试计划并验证，不能用于执行实际的并发压测。在 GUI 中准备就绪之后，我们可以在【文件】->【保存测试计划为】中将测试计划另存为 `rest-order-thread-group.jmx` 测试文件，以便我们在命令行进行压测：

```shell
jmeter -n -t ./rest-order-thread-group.jmx -l ./result.txt -e -o ./webreport
```

下图展示了最终生成的测试报告，主要汇总了执行次数、响应时间、吞吐量、网络传输速率。

![image-20190905215339406](https://kirito.iocoder.cn/image-20190905215339406.png)

在实际的测试报告中，还有更加详细的维度可以展示，上述只是展示了汇总信息。

## 4 JMeter 压测 Dubbo

JMeter 默认并不支持私有的 dubbo 协议，但其优秀的扩展机制使得只需要添加插件，就可以完成 Dubbo 压测，这一节也是本文重点介绍的部分。

### 4.1 安装 jmeter-plugins-for-apache-dubbo

> 插件地址：https://github.com/thubbo/jmeter-plugins-for-apache-dubbo

目前该插件支持对最新版本的 Dubbo 进行压测，推荐的安装方式：

1. 克隆项目：`git clone https://github.com/thubbo/jmeter-plugins-for-apache-dubbo.git`

2. 打包项目，构建 JMeter 插件：`mvn clean install` ，得到：jmeter-plugins-dubbo-2.7.3-jar-with-dependencies.jar
3. 将插件添加到 `${JMETER_HOME}\lib\ext`

![安装插件后的 ext 目录](https://kirito.iocoder.cn/image-20190906140927770.png)

### 4.2 增加 Dubbo 取样器

之前的小结已经介绍了如何添加线程组和 HTTP 取样器，现在想要对 Dubbo 应用进行性能测试，可以直接复用之前的线程组配置，在线程组上右键 【添加】-->【取样器】-->【Dubbo Sample】。

![image-20190906141506679](https://kirito.iocoder.cn/image-20190906141506679.png)

创建 Dubbo 取样器之后，可以对其进行配置

![image-20190906143444779](https://kirito.iocoder.cn/image-20190906143444779.png)

### 4.3 准备 Dubbo Provider

复用 HTTP 取样器时的 `OrderService` 

```java
@Service
public class OrderDubboProvider implements OrderApi {

    @Autowired
    OrderService orderService;

    @Override
    public OrderDTO queryOrder(long orderNo) {
        return orderService.queryOrder(orderNo);
    }
}
```

配置 application.properties，注册服务到 Zookeeper 注册中心:

```properties
dubbo.scan.basePackages=com.alibaba.edas.benchmark
dubbo.application.name=dubbo-provider-demo
dubbo.registry.address=zookeeper://127.0.0.1:2181
dubbo.protocol.port=20880
```

### 4.4 验证结果

在 JMeter 中配置好 Dubbo 服务所连接的注册中心，接着通过 `Get Provider List` 可以获取到服务提供者列表，以供压测选择。在线程组上右键 【验证】，执行单次验证，可以用来测试与服务端的连通性。在【察看结果树】选项卡中可以看到【响应数据】可以正常执行 Dubbo 调用了。

![image-20190906143425928](https://kirito.iocoder.cn/image-20190906143425928.png)

### 4.5 执行测试计划

可以将 Dubbo 取样器和 HTTP 取样器包含在同一个测试计划中一起执行，同时进行了 Dubbo 接口与 Rest 接口的性能对比。在命令行进行压测：

```shell
jmeter -n -t ./rest-order-thread-group.jmx -l ./result.txt -e -o ./webreport
```

下图展示了最终生成的测试报告：

![image-20190906144422407](https://kirito.iocoder.cn/image-20190906144422407.png)

Dubbo 接口与 Rest 接口所封装的业务接口均为 `OrderService`，所以压测上的差距直接体现出了 Dubbo 和 Rest 的差距。从报告对比上来看，Dubbo 接口的平均 RT 远低于 Rest 接口。

## 5 总结

本文从零到一介绍了使用 JMeter 压测 HTTP 的方法，让读者熟悉 JMeter 的使用方式，并着重介绍了使用 jmeter-plugins-for-apache-dubbo 插件压测 Dubbo 的方法。

由于 JMeter Plugin 的限制，目前 Dubbo 的压测请求是通过泛化调用进行发送的，会有一定程度的性能下降，所以在实际评估 Dubbo 接口性能时，接口实际性能会比压测结果更加乐观。
