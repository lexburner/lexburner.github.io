---
title: Dubbo 支持的几个主流序列化框架评测
toc: true
type: 1
date: 2021-08-15 19:14:13
category:
- RPC
tags:
- 序列化
---

## 前言

今天要聊的技术是序列化，这不是我第一次写序列化相关的文章了，今天动笔之前，我还特地去博客翻了下我博客早期的一篇序列化文章（如下图），竟然都过去 4 年了。

![历史记录](https://image.cnkirito.cn/image-20210815193159089.png)

为什么又想聊序列化了呢？因为最近的工作用到了序列化相关的内容，其次，这几年 Dubbo 也发生了翻天覆地的变化，其中 Dubbo 3.0 主推的 Tripple 协议，更是打着下一代 RPC 通信协议的旗号，有取代 Dubbo 协议的势头。而 Tripple 协议使用的便是 Protobuf 序列化方案。

另外，Dubbo 社区也专门搞了一个序列化压测的项目：https://github.com/apache/dubbo-benchmark.git ，本文也将围绕这个项目，从性能维度展开对 Dubbo 支持的各个序列化框架的讨论。 

## 当我们聊序列化的时候，我们关注什么？

最近几年，各种新的高效序列化方式层出不穷，最典型的包括：

- 专门针对 Java 语言的：JDK 序列化、Kryo、FST
- 跨语言的：Protostuff，ProtoBuf，Thrift，Avro，MsgPack 等等

为什么开源社区涌现了这么多的序列化框架，Dubbo 也扩展了这么多的序列化实现呢？主要还是为了满足不同的需求。

序列化框架的选择主要有以下几个方面：

1. 跨语言。是否只能用于 java 间序列化 / 反序列化，是否跨语言，跨平台。
2. 性能。分为空间开销和时间开销。序列化后的数据一般用于存储或网络传输，其大小是很重要的一个参数；解析的时间也影响了序列化协议的选择，如今的系统都在追求极致的性能。
3. 兼容性。系统升级不可避免，某一实体的属性变更，会不会导致反序列化异常，也应该纳入序列化协议的考量范围。

和 CAP 理论有点类似，目前市面上很少有一款序列化框架能够同时在三个方面做到突出，例如 Hessian2 在兼容性方面的表现十分优秀，性能也尚可，Dubbo 便使用了其作为默认序列化实现，而性能方面它其实是不如 Kryo 和 FST 的，在跨语言这一层面，它表现的也远不如 ProtoBuf，JSON。

其实反过来想想，要是有一个序列化方案既是跨语言的，又有超高的性能，又有很好的兼容性，那不早就成为分布式领域的标准了？其他框架早就被干趴了。

大多数时候，我们是挑选自己关注的点，找到合适的框架，满足我们的诉求，这才导致了序列化框架百花齐放的局面。

## 性能测试

很多序列化框架都宣称自己是“高性能”的，光他们说不行呀，我还是比较笃信“benchmark everything”的箴言，这样得出的结论，更能让我对各个技术有自己的认知，避免人云亦云，避免被不是很权威的博文误导。

怎么做性能测试呢？例如像这样？

```java
long start = System.currentTimeMillis();
measure();
System.out.println(System.currentTimeMillis()-start);
```



貌似不太高大上，但又说不上有什么问题。如果你这么想，那我推荐你了解下 JMH 基准测试框架，我之前写过的一篇文章《[JAVA 拾遗 — JMH 与 8 个测试陷阱](https://www.cnkirito.moe/java-jmh/)》推荐你先阅读以下。

事实上，Dubbo 社区的贡献者们早就搭建了一个比较完备的 Dubbo 序列化基础测试工程：https://github.com/apache/dubbo-benchmark.git。

![dubbo-benchmark](https://image.cnkirito.cn/image-20210815203229668.png)

你只要具备基本的 JMH 和 Dubbo 的知识，就可以测试出在 Dubbo 场景下各个序列化框架的表现。

我这里也准备了一份我测试的报告，供读者们参考。如果大家准备自行测试，不建议在个人 windows/mac 上 benchmark，结论可能会不准确。我使用了两台阿里云的 ECS 来进行测试，测试环境：Aliyun Linux，4c8g，启动脚本：

```shell
java -server -Xmx2g -Xms2g -XX:MaxDirectMemorySize=1g -XX:+UseG1GC -XX:+PrintGCDetails -XX:+PrintGCTimeStamps -Xloggc:/home/admin/
```

为啥选择这个配置？我手上正好有两台这样的资源，没有特殊的设置~，况且从启动脚本就可以看出来，压测程序不会占用太多资源，我都没用满。

测试工程介绍：

```java
public interface UserService {
    public boolean existUser(String email);

    public boolean createUser(User user);

    public User getUser(long id);

    public Page<User> listUser(int pageNo);
}
```

一个 `UserService` 接口对业务应用中的 CRUD 操作。server 端以不同的序列化方案提供该服务，client 使用 JMH 进行多轮压测。

```java
@Benchmark
    @BenchmarkMode({Mode.Throughput })
    @OutputTimeUnit(TimeUnit.SECONDS)
    @Override
    public boolean existUser() throws Exception {
      // ...
    }

    @Benchmark
    @BenchmarkMode({Mode.Throughput})
    @OutputTimeUnit(TimeUnit.SECONDS)
    @Override
    public boolean createUser() throws Exception {
      // ...
    }

    @Benchmark
    @BenchmarkMode({Mode.Throughput})
    @OutputTimeUnit(TimeUnit.SECONDS)
    @Override
    public User getUser() throws Exception {
      // ...
    }

    @Benchmark
    @BenchmarkMode({Mode.Throughput})
    @OutputTimeUnit(TimeUnit.SECONDS)
    @Override
    public Page<User> listUser() throws Exception {
      // ...
    }
```

整体的 benchmark 框架结构如上，详细的实现，可以参考源码。我这里只选择的一个评测指标 Throughput，即吞吐量。

省略一系列压测过程，直接给出结果：

**Kryo**

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  20913.339 ± 3948.207  ops/s
Client.existUser   thrpt    3  31669.871 ± 1582.723  ops/s
Client.getUser     thrpt    3  29706.647 ± 3278.029  ops/s
Client.listUser    thrpt    3  17234.979 ± 1818.964  ops/s
```

**Fst**

```
Benchmark           Mode  Cnt      Score       Error  Units
Client.createUser  thrpt    3  15438.865 ±  4396.911  ops/s
Client.existUser   thrpt    3  25197.331 ± 12116.109  ops/s
Client.getUser     thrpt    3  21723.626 ±  7441.582  ops/s
Client.listUser    thrpt    3  15768.321 ± 11684.183  ops/s
```

**Hessian2**

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  22948.875 ± 2005.721  ops/s
Client.existUser   thrpt    3  34735.122 ± 1477.339  ops/s
Client.getUser     thrpt    3  20679.921 ±  999.129  ops/s
Client.listUser    thrpt    3   3590.129 ±  673.889  ops/s
```

**FastJson**

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  26269.487 ± 1667.895  ops/s
Client.existUser   thrpt    3  29468.687 ± 5152.944  ops/s
Client.getUser     thrpt    3  25204.239 ± 4326.485  ops/s
Client.listUser    thrpt    3   9823.574 ± 2087.110  ops/s
```

**Tripple**

```
Benchmark           Mode  Cnt      Score       Error  Units
Client.createUser  thrpt    3  19721.871 ±  5121.444  ops/s
Client.existUser   thrpt    3  35350.031 ± 20801.169  ops/s
Client.getUser     thrpt    3  20841.078 ±  8583.225  ops/s
Client.listUser    thrpt    3   4655.687 ±   207.503  ops/s
```

怎么看到这个测试结果呢？createUser、existUser、getUser 这几个方法测试下来，效果是参差不齐的，不能完全得出哪个框架性能最优，我的推测是因为序列化的数据量比较简单，量也不大，就是一个简单的 User 对象；而 listUser 的实现是返回了一个较大的 `List<User>` ，可以发现，Kryo 和 Fst 序列化的确表现优秀，处于第一梯队；令我意外的是 FastJson 竟然比 Hessian 还要优秀，位列第二梯队；Tripple（背后是 ProtoBuf）和 Hessian2 位列第三梯队。

当然，这样的结论一定受限于 benchmark 的模型，测试用例中模拟的 CRUD 也不一定完全贴近业务场景，毕竟业务是复杂的。

怎么样，这样的结果是不是也符合你的预期呢？

## Dubbo 序列化二三事

最后，聊聊你可能知道也可能不知道的一些序列化知识。

### hession-lite

Dubbo 使用的 Hessian2 其实并不是原生的 Hessian2 方案。注意看源码中的依赖：

```xml
<dependency>
  <groupId>com.alibaba</groupId>
  <artifactId>hessian-lite</artifactId>
</dependency>
```

最早是阿里开源的 hessian-lite，后来随着 Dubbo 贡献给了 Apache，该项目也一并进入了 Apache，github 地址：https://github.com/apache/dubbo-hessian-lite。相比原生 Hessian2，Dubbo 独立了一个仓库致力于在 RPC 场景下，发挥出更高的性能以及满足一些定制化的需求。

### 在 IO 线程中进行序列化

Dubbo 客户端在高版本中默认是在业务线程中进行序列化的，而不是 IO 线程，你可以通过 decode.in.io 控制序列化与哪个线程绑定

```xml
    <dubbo:reference id="userService" check="false"
                     interface="org.apache.dubbo.benchmark.service.UserService"
                     url="dubbo://${server.host}:${server.port}">
        <dubbo:parameter key="decode.in.io" value="true" />
    </dubbo:reference>
```

在 benchmark 时，我发现 IO 线程中进行序列化，性能会更好，这可能和序列化本身是一个耗费 CPU 的操作，多线程无法加速反而会导致更多的竞争有关。

### SerializationOptimizer

某些序列化实现，例如 Kryo 和 Fst 可以通过显示注册序列化的类来进行加速，如果想利用该特性来提升序列化性能，可以实现 org.apache.dubbo.common.serialize.support.SerializationOptimizer 接口。一个示例：

```java
public class SerializationOptimizerImpl implements SerializationOptimizer {
    @Override
    public Collection<Class<?>> getSerializableClasses() {
        return Arrays.asList(User.class, Page.class, UserService.class);
    }
}
```

按照大多数人的习惯，可能会觉得这很麻烦，估计很少有用户这么用。注意客户端和服务端需要同时开启这一优化。

别忘了在 protocol 上配置指定这一优化器：

```xml
<dubbo:protocol name="dubbo" host="${server.host}" server="netty4" port="${server.port}" serialization="kryo" optimizer="org.apache.dubbo.benchmark.serialize.SerializationOptimizerImpl"/>
```

### 序列化方式由服务端指定

一般而言，Dubbo 框架使用的协议（默认是 dubbo）和序列化方式（默认是 hessian2）是由服务端指定的，不需要在消费端指定。因为服务端是服务的提供者，拥有对服务的定义权，消费者在订阅服务收到服务地址通知时，服务地址会包含序列化的实现方式，Dubbo 以这样的契约方式从而实现 consumer 和 provider 的协同通信。

在大多数业务应用，应用可能既是服务 A 的提供者，同时也是服务 B 的消费者，所以建议在架构决策者层面协商固定出统一的协议，如果没有特殊需求，保持默认值即可。

但如果应用仅仅作为消费者，而又想指定序列化协议或者优化器（某些特殊场景），注意这时候配置 protolcol 是不生效的，因为没有服务提供者是不会触发 protocol 的配置流程的。可以像下面这样指定消费者的配置：

```xml
<dubbo:reference id="userService" check="false"
                 interface="org.apache.dubbo.benchmark.service.UserService"
                 url="dubbo://${server.host}:${server.port}?optimizer=org.apache.dubbo.benchmark.serialize.SerializationOptimizerImpl&amp;serialization=kryo">
    <dubbo:parameter key="decode.in.io" value="true" />
</dubbo:reference>
```

> `&amp;` 代表 &，避免 xml 中的转义问题

## 总结

借 Dubbo 中各个序列化框架的实现，本文探讨了选择序列化框架时我们的关注点，并探讨了各个序列化实现在 Dubbo 中具体的性能表现， 给出了详细的测试报告，同时，也给出了一些序列化的小技巧，如果在 Dubbo 中修改默认的序列化行为，你可能需要关注这些细节。

最后再借 Dubbo3 支持的 Tripple 协议来聊一下技术发展趋势的问题。我们知道 json 能替代 xml 作为众多前后端开发者耳熟能详的一个技术，并不是因为其性能如何如何，而是在于其恰如其分的解决了大家的问题。一个技术能否流行，也是如此，一定在于其帮助用户解决了痛点。至于解决了什么问题，在各个历史发展阶段又是不同的，曾经，Dubbo2.x 凭借着其丰富的扩展能力，强大的性能，活跃度高的社区等优势帮助用户解决一系列的难题，也获得了非常多用户的亲来；现在，Dubbo3.x 提出的应用级服务发现、统一治理规则、Tripple 协议，也是在尝试解决云原生时代下的难题，如多语言，适配云原生基础设施等，追赶时代，帮助用户。

