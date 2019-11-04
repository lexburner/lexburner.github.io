---
title: 【Dubbo3.0 新特性】集成 RSocket, 新增响应式支持
date: 2019-04-11 19:19:41
tags:
- Dubbo
categories:
- RPC
---

## 响应式编程

响应式编程现在是现在一个很热的话题。响应式编程让开发者更方便地编写高性能的异步代码，关于响应式编程更详细的信息可以参考 http://reactivex.io/ 。很可惜，在之前很长一段时间里，Dubbo 并不支持响应式编程，简单来说，Dubbo 不支持在 rpc 调用时，使用 Mono/Flux 这种流对象（reactive-stream 中流的概念 )，给用户使用带来了不便。

RSocket 是一个支持 reactive-stream 语义的开源网络通信协议，它将 reactive 语义的复杂逻辑封装了起来，使得上层可以方便实现网络程序。RSocket 详细资料：http://rsocket.io/。

Dubbo 在 [3.0.0-SNAPSHOT](https://github.com/apache/incubator-Dubbo/tree/3.x-dev) 版本里基于 RSocket 对响应式编程提供了支持，用户可以在请求参数和返回值里使用 Mono 和 Flux 类型的对象。下面我们给出使用范例，源码可以在文末获取。

<!--more-->

## Dubbo RSocket 初体验

### 服务接口

```Java
public interface DemoService {
    Mono<String> requestMonoWithMonoArg(Mono<String> m1, Mono<String> m2);
    Flux<String> requestFluxWithFluxArg(Flux<String> f1, Flux<String> f2);
}
```

```xml
<dependency>
    <groupId>io.projectreactor</groupId>
    <artifactId>reactor-core</artifactId>
    <version>3.2.3-RELEASE</version>
</dependency>
```

在服务定义层，引入了 Mono，Flux 等 reactor 的概念，所以需要添加 reactor-core 的依赖。

### 服务提供者

```Java
public class DemoServiceImpl implements DemoService {
    @Override
    public Mono<String> requestMonoWithMonoArg(Mono<String> m1, Mono<String> m2) {
        return m1.zipWith(m2, new BiFunction<String, String, String>() {
            @Override
            public String apply(String s, String s2) {
                return s+" "+s2;
            }
        });
    }

    @Override
    public Flux<String> requestFluxWithFluxArg(Flux<String> f1, Flux<String> f2) {
        return f1.zipWith(f2, new BiFunction<String, String, String>() {
            @Override
            public String apply(String s, String s2) {
                return s+" "+s2;
            }
        });
    }
}
```

除了常规的 Dubbo 必须依赖之外，还需要添加 dubbo-rsocket 的扩展

```xml
//... other dubbo moudle
<dependency>
    <groupId>org.apache.dubbo</groupId>
    <artifactId>dubbo-rpc-rsocket</artifactId>
</dependency>
```

配置并启动服务端，注意协议名字填写 rsocket：

```xml
<beans xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:dubbo="http://dubbo.apache.org/schema/dubbo"
       xmlns="http://www.springframework.org/schema/beans"
       xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans.xsd
       http://dubbo.apache.org/schema/Dubbo http://dubbo.apache.org/schema/dubbo/dubbo.xsd">

    <!-- provider's application name, used for tracing dependency relationship -->
    <dubbo:application name="demo-provider"/>

    <!-- use registry center to export service -->
    <dubbo:registry address="zookeeper://127.0.0.1:2181"/>

    <!-- use Dubbo protocol to export service on port 20890 -->
    <dubbo:protocol name="rsocket" port="20890"/>

    <!-- service implementation, as same as regular local bean -->
    <bean id="demoService" class="org.apache.dubbo.samples.basic.impl.DemoServiceImpl"/>

    <!-- declare the service interface to be exported -->
    <dubbo:service interface="org.apache.dubbo.samples.basic.api.DemoService" ref="demoService"/>

</beans>
```

服务提供者的 bootstrap：

```Java
public class RsocketProvider {

    public static void main(String[] args) throws Exception {
        ClassPathXmlApplicationContext context = new ClassPathXmlApplicationContext(new String[]{"spring/rsocket-provider.xml"});
        context.start();
        System.in.read(); // press any key to exit
    }

}
```

### 服务消费者

然后配置并启动消费者消费者如下, 注意协议名填写 rsocket：

```xml
<beans xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:dubbo="http://dubbo.apache.org/schema/Dubbo"
       xmlns="http://www.springframework.org/schema/beans"
       xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans.xsd
       http://dubbo.apache.org/schema/dubbo http://dubbo.apache.org/schema/dubbo/dubbo.xsd">

    <!-- consumer's application name, used for tracing dependency relationship (not a matching criterion),
    don't set it same as provider -->
    <dubbo:application name="demo-consumer"/>

    <!-- use registry center to discover service -->
    <dubbo:registry address="zookeeper://127.0.0.1:2181"/>

    <!-- generate proxy for the remote service, then demoService can be used in the same way as the
    local regular interface -->
    <dubbo:reference id="demoService" check="true" interface="org.apache.dubbo.samples.basic.api.DemoService"/>

</beans>
```

```Java
public class RsocketConsumer {

    public static void main(String[] args) {
        ClassPathXmlApplicationContext context = new ClassPathXmlApplicationContext(new String[]{"spring/rsocket-consumer.xml"});
        context.start();
        DemoService demoService = (DemoService) context.getBean("demoService"); // get remote service proxy

        while (true) {
            try {
                Mono<String> monoResult = demoService.requestMonoWithMonoArg(Mono.just("A"), Mono.just("B"));
                monoResult.doOnNext(new Consumer<String>() {
                    @Override
                    public void accept(String s) {
                        System.out.println(s);
                    }
                }).block();

                Flux<String> fluxResult = demoService.requestFluxWithFluxArg(Flux.just("A","B","C"), Flux.just("1","2","3"));
                fluxResult.doOnNext(new Consumer<String>() {
                    @Override
                    public void accept(String s) {
                        System.out.println(s);
                    }
                }).blockLast();

            } catch (Throwable throwable) {
                throwable.printStackTrace();
            }
        }
    }
}
```

可以看到配置上除了协议名使用 rsocket 以外其他并没有特殊之处。

## 实现原理

以前用户并不能在参数或者返回值里使用 Mono/Flux 这种流对象（reactive-stream 里的流的概念）。因为流对象自带异步属性，当业务把流对象作为参数或者返回值传递给框架之后，框架并不能将流对象正确的进行序列化。

Dubbo 基于 RSocket 提供了 reactive 支持。RSocket 将 reactive 语义的复杂逻辑封装起来了，给上层提供了简洁的抽象如下：
```Java
Mono<Void> fireAndForget(Payload payload);

Mono<Payload> requestResponse(Payload payload);

Flux<Payload> requestStream(Payload payload);

Flux<Payload> requestChannel(Publisher<Payload> payloads);
```

- 从客户端视角看，框架建立连接之后，只需要将请求信息编码到 Payload 里，然后通过 requestStream 方法即可向服务端发起请求。
- 从服务端视角看，RSocket 收到请求之后，会调用我们实现的 requestStream 方法，我们从 Payload 里解码得到请求信息之后，调用业务方法，然后拿到 Flux 类型的返回值即可。

需要注意的是业务返回值一般是 `Flux<BizDO>`，而 RSocket 要求的是 `Flux<Payload>`，所以我们需要通过 map operator 拦截业务数据，将 BizDO 编码为 Payload 才可以递交给 RSocket。而 RSocket 会负责数据的传输和 reactive 语义的实现。

## 结语

Dubbo 2.7 相比 Dubbo 2.6 提供了 CompletableFuture 的异步化支持，在 Dubbo 3.0 又继续拥抱了 Reactive，不断对新特性的探索，无疑是增加了使用者的信心。RSocket 这一框架 / 协议，如今在国内外也是比较火的一个概念，它提供了丰富的 Reactive 语义以及多语言的支持，使得服务治理框架可以很快地借助它实现 Reactive 语义。有了响应式编程支持，业务可以更加方便的实现异步逻辑。

本篇文章对 Dubbo RSocket 进行了一个简单的介绍，对 Reactive、RSocket 感兴趣的同学也可以浏览下 Dubbo 3.0 源码对 RSocket 的封装。



相关链接：

[1] 文中源码：https://github.com/apache/incubator-dubbo-samples/tree/3.x/dubbo-samples-rsocket

[2] Dubbo 3.x 开发分支：https://github.com/apache/incubator-Dubbo/tree/3.x-dev
