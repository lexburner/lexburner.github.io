---
title: 用了这么久配置中心，还不知道长轮询是什么？
date: 2021-01-23 14:37:39
tags:
- Nacos
categories:
- Nacos
toc: true
---

## 前言

传统的静态配置方式想要修改某个配置时，必须重新启动一次应用，如果是数据库连接串的变更，那可能还容易接受一些，但如果变更的是一些运行时实时感知的配置，如某个功能项的开关，重启应用就显得有点大动干戈了。配置中心正是为了解决此类问题应运而生的，特别是在微服务架构体系中，更倾向于使用配置中心来统一管理配置。

配置中心最核心的能力就是配置的动态推送，常见的配置中心如 Nacos、Apollo 等都实现了这样的能力。在早期接触配置中心时，我就很好奇，配置中心是如何做到服务端感知配置变化实时推送给客户端的，在没有研究过配置中心的实现原理之前，我一度认为配置中心是通过**长连接**来做到配置推送的。事实上，目前比较流行的两款配置中心：Nacos 和 Apollo 恰恰都没有使用**长连接**，而是使用的**长轮询**。本文便是介绍一下长轮询这种听起来好像已经是上个世纪的技术，老戏新唱，看看能不能品出别样的韵味。文中会有代码示例，呈现一个简易的配置监听流程。

<!-- more -->

## 数据交互模式

众所周知，数据交互有两种模式：Push（推模式）和 Pull（拉模式）。

推模式指的是客户端与服务端建立好网络长连接，服务方有相关数据，直接通过长连接通道推送到客户端。其优点是及时，一旦有数据变更，客户端立马能感知到；另外对客户端来说逻辑简单，不需要关心有无数据这些逻辑处理。缺点是不知道客户端的数据消费能力，可能导致数据积压在客户端，来不及处理。

拉模式指的是客户端主动向服务端发出请求，拉取相关数据。其优点是此过程由客户端发起请求，故不存在推模式中数据积压的问题。缺点是可能不够及时，对客户端来说需要考虑数据拉取相关逻辑，何时去拉，拉的频率怎么控制等等。

## 长轮询与轮询

在开头，重点介绍一下长轮询（Long Polling）和轮询（Polling）的区别，两者都是拉模式的实现。

「轮询」是指不管服务端数据有无更新，客户端每隔定长时间请求拉取一次数据，可能有更新数据返回，也可能什么都没有。配置中心如果使用「轮询」实现动态推送，会有以下问题：

- 推送延迟。客户端每隔 5s 拉取一次配置，若配置变更发生在第 6s，则配置推送的延迟会达到 4s。
- 服务端压力。配置一般不会发生变化，频繁的轮询会给服务端造成很大的压力。
- 推送延迟和服务端压力无法中和。降低轮询的间隔，延迟降低，压力增加；增加轮询的间隔，压力降低，延迟增高。

「长轮询」则不存在上述的问题。客户端发起长轮询，如果服务端的数据没有发生变更，会 hold 住请求，直到服务端的数据发生变化，或者等待一定时间超时才会返回。返回后，客户端又会立即再次发起下一次长轮询。配置中心使用「长轮询」如何解决「轮询」遇到的问题也就显而易见了：

- 推送延迟。服务端数据发生变更后，长轮询结束，立刻返回响应给客户端。
- 服务端压力。长轮询的间隔期一般很长，例如 30s、60s，并且服务端 hold 住连接不会消耗太多服务端资源。

以 Nacos 为例的长轮询流程如下：

![nacos long polling](https://image.cnkirito.cn/image-20210124145858668.png)

可能有人会有疑问，为什么一次长轮询需要等待一定时间超时，超时后又发起长轮询，为什么不让服务端一直 hold 住？主要有两个层面的考虑，一是连接稳定性的考虑，长轮询在传输层本质上还是走的 TCP 协议，如果服务端假死、fullgc 等异常问题，或者是重启等常规操作，长轮询没有应用层的心跳机制，仅仅依靠 TCP 层的心跳保活很难确保可用性，所以一次长轮询设置一定的超时时间也是在确保可用性。除此之外，在配置中心场景，还有一定的业务需求需要这么设计。在配置中心的使用过程中，用户可能随时新增配置监听，而在此之前，长轮询可能已经发出，新增的配置监听无法包含在旧的长轮询中，所以在配置中心的设计中，一般会在一次长轮询结束后，将新增的配置监听给捎带上，而如果长轮询没有超时时间，只要配置一直不发生变化，响应就无法返回，新增的配置也就没法设置监听了。

## 配置中心长轮询设计

上文的图中，介绍了长轮询的流程，本节会详解配置中心长轮询的设计细节。

- 客户端发起长轮询

  客户端发起一个 HTTP 请求，请求信息包含配置中心的地址，以及监听的 dataId（本文出于简化说明的考虑，认为 dataId 是定位配置的唯一键）。若配置没有发生变化，客户端与服务端之间一直处于连接状态。

- 服务端监听数据变化

  服务端会维护 dataId 和长轮询的映射关系，如果配置发生变化，服务端会找到对应的连接，为响应写入更新后的配置内容。如果超时内配置未发生变化，服务端找到对应的超时长轮询连接，写入 304 响应。

  > 304 在 HTTP 响应码中代表“未改变”，并不代表错误。比较契合长轮询时，配置未发生变更的场景。

- 客户端接收长轮询响应

  首先查看响应码是 200 还是 304，以判断配置是否变更，做出相应的回调。之后再次发起下一次长轮询。

- 服务端设置配置写入的接入点

  主要用配置控制台和 client 发布配置，触发配置变更

这几点便是配置中心实现长轮询的核心步骤，也是指导下面章节代码实现的关键。但在编码之前，仍有一些其他的注意点需要实现阐明。

配置中心往往是为分布式的集群提供服务的，而每个机器上部署的应用，又会有多个 dataId 需要监听，实例级别 * 配置数是一个不小的数字，配置中心服务端维护这些 dataId 的长轮询连接显然不能用线程一一对应，否则会导致服务端线程数爆炸式增长。一个 Tomcat 也就 200 个线程，长轮询也不应该阻塞 Tomcat 的业务线程，所以需要配置中心在实现长轮询时，往往采用异步响应的方式来实现。而比较方便实现异步 HTTP 的常见手段便是 Servlet3.0 提供的 AsyncContext 机制。

> Servlet3.0 并不是一个特别新的规范，它跟 Java 6 是同一时期的产物。例如 SpringBoot 内嵌的 Tomcat 很早就支持了 Servlet3.0，你无需担心 AsyncContext 机制不起作用。

SpringMVC 实现了 DeferredResult 和 Servlet3.0 提供的 AsyncContext 其实没有多大区别，我并没有深入研究过两个实现背后的源码，但从使用层面上来看，AsyncContext 更加的灵活，例如其可以自定义响应码，而 DeferredResult 在上层做了封装，可以快速的帮助开发者实现一个异步响应，但没法细粒度地控制响应。所以下文的示例中，我选择了 AsyncContext。

## 配置中心长轮询实现 

### 客户端实现

```java
@Slf4j
public class ConfigClient {

    private CloseableHttpClient httpClient;
    private RequestConfig requestConfig;

    public ConfigClient() {
        this.httpClient = HttpClientBuilder.create().build();
        // ① httpClient 客户端超时时间要大于长轮询约定的超时时间
        this.requestConfig = RequestConfig.custom().setSocketTimeout(40000).build();
    }

    @SneakyThrows
    public void longPolling(String url, String dataId) {
        String endpoint = url + "?dataId=" + dataId;
        HttpGet request = new HttpGet(endpoint);
        CloseableHttpResponse response = httpClient.execute(request);
        switch (response.getStatusLine().getStatusCode()) {
            case 200: {
                BufferedReader rd = new BufferedReader(new InputStreamReader(response.getEntity()
                    .getContent()));
                StringBuilder result = new StringBuilder();
                String line;
                while ((line = rd.readLine()) != null) {
                    result.append(line);
                }
                response.close();
                String configInfo = result.toString();
                log.info("dataId: [{}] changed, receive configInfo: {}", dataId, configInfo);
                longPolling(url, dataId);
                break;
            }
            // ② 304 响应码标记配置未变更
            case 304: {
                log.info("longPolling dataId: [{}] once finished, configInfo is unchanged, longPolling again", dataId);
                longPolling(url, dataId);
                break;
            }
            default: {
                throw new RuntimeException("unExcepted HTTP status code");
            }
        }

    }

    public static void main(String[] args) {
        // httpClient 会打印很多 debug 日志，关闭掉
        Logger logger = (Logger)LoggerFactory.getLogger("org.apache.http");
        logger.setLevel(Level.INFO);
        logger.setAdditive(false);

        ConfigClient configClient = new ConfigClient();
        // ③ 对 dataId: user 进行配置监听 
        configClient.longPolling("http://127.0.0.1:8080/listener", "user");
    }

}
```

主要有三个注意点：

- `RequestConfig.custom().setSocketTimeout(40000).build()` 。httpClient 客户端超时时间要大于长轮询约定的超时时间。很好理解，不然还没等服务端返回，客户端会自行断开 HTTP 连接。
- `response.getStatusLine().getStatusCode() == 304` 。前文介绍过，约定使用 304 响应码来标识配置未发生变更，客户端继续发起长轮询。
- `configClient.longPolling("http://127.0.0.1:8080/listener", "user")`。在示例中，我们处于简单考虑，仅仅启动一个客户端，对单一的 dataId：user 进行监听（注意，需要先启动 server 端）。

### 服务端实现

```java
@RestController
@Slf4j
@SpringBootApplication
public class ConfigServer {

    @Data
    private static class AsyncTask {
        // 长轮询请求的上下文，包含请求和响应体
        private AsyncContext asyncContext;
        // 超时标记
        private boolean timeout;

        public AsyncTask(AsyncContext asyncContext, boolean timeout) {
            this.asyncContext = asyncContext;
            this.timeout = timeout;
        }
    }

    // guava 提供的多值 Map，一个 key 可以对应多个 value
    private Multimap<String, AsyncTask> dataIdContext = Multimaps.synchronizedSetMultimap(HashMultimap.create());

    private ThreadFactory threadFactory = new ThreadFactoryBuilder().setNameFormat("longPolling-timeout-checker-%d")
        .build();
    private ScheduledExecutorService timeoutChecker = new ScheduledThreadPoolExecutor(1, threadFactory);

    // 配置监听接入点
    @RequestMapping("/listener")
    public void addListener(HttpServletRequest request, HttpServletResponse response) {

        String dataId = request.getParameter("dataId");
        
        // 开启异步
        AsyncContext asyncContext = request.startAsync(request, response);
        AsyncTask asyncTask = new AsyncTask(asyncContext, true);

        // 维护 dataId 和异步请求上下文的关联
        dataIdContext.put(dataId, asyncTask);

        // 启动定时器，30s 后写入 304 响应
        timeoutChecker.schedule(() -> {
            if (asyncTask.isTimeout()) {
                dataIdContext.remove(dataId, asyncTask);
                response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
                asyncContext.complete();
            }
        }, 30000, TimeUnit.MILLISECONDS);
    }

    // 配置发布接入点
    @RequestMapping("/publishConfig")
    @SneakyThrows
    public String publishConfig(String dataId, String configInfo) {
        log.info("publish configInfo dataId: [{}], configInfo: {}", dataId, configInfo);
        Collection<AsyncTask> asyncTasks = dataIdContext.removeAll(dataId);
        for (AsyncTask asyncTask : asyncTasks) {
            asyncTask.setTimeout(false);
            HttpServletResponse response = (HttpServletResponse)asyncTask.getAsyncContext().getResponse();
            response.setStatus(HttpServletResponse.SC_OK);
            response.getWriter().println(configInfo);
            asyncTask.getAsyncContext().complete();
        }
        return "success";
    }

    public static void main(String[] args) {
        SpringApplication.run(ConfigServer.class, args);
    }

}
```

对上述实现的一些说明：

`@RequestMapping("/listener")` ，配置监听接入点，也是长轮询的入口。在获取 dataId 之后，使用 `request.startAsync` 将请求设置为异步，这样在方法结束后，不会占用 Tomcat 的线程池。

接着 `dataIdContext.put(dataId, asyncTask) ` 会将 dataId 和异步请求上下文给关联起来，方便配置发布时，拿到对应的上下文。注意这里使用了一个 guava 提供的数据结构 `Multimap<String, AsyncTask> dataIdContext` ，它是一个多值 Map，一个 key 可以对应多个 value，你也可以理解为 `Map<String,List<AsyncTask>>` ，但使用 `Multimap` 维护起来可以更方便地处理一些并发逻辑。至于为什么会有多值，很好理解，因为配置中心的 Server 端会接受来自多个客户端对同一个 dataId 的监听。

`timeoutChecker.schedule()` 启动定时器，30s 后写入 304 响应。再结合之前客户端的逻辑，接收到 304 之后，会重新发起长轮询，形成一个循环。

`@RequestMapping("/publishConfig")` ，配置发布的入口。配置变更后，根据 dataId 一次拿出所有的长轮询，为之写入变更的响应，同时不要忘记取消定时任务。至此，完成了一个配置变更后推送的流程。

### 启动配置监听

先启动 ConfigServer，再启动 ConfigClient。客户端打印长轮询的日志如下：

```
22:18:09.185 [main] INFO moe.cnkirito.demo.ConfigClient - longPolling dataId: [user] once finished, configInfo is unchanged, longPolling again
22:18:39.197 [main] INFO moe.cnkirito.demo.ConfigClient - longPolling dataId: [user] once finished, configInfo is unchanged, longPolling again
```

发布一条配置，`curl -X GET "localhost:8080/publishConfig?dataId=user&configInfo=helloworld"`

服务端打印日志如下：

```
2021-01-24 22:18:50.801  INFO 73301 --- [nio-8080-exec-6] moe.cnkirito.demo.ConfigServer           : publish configInfo dataId: [user], configInfo: helloworld
```

客户端接受配置推送：

```
22:18:50.806 [main] INFO moe.cnkirito.demo.ConfigClient - dataId: [user] changed, receive configInfo: helloworld
```

## 实现细节思考

### 为什么需要定时器返回 304

上述的实现中，服务端采用了一个定时器，在配置未发生变更时，定时返回 304，客户端接收到 304 之后，重新发起长轮询。在前文，已经解释过了为什么需要超时后重新发起长轮询，而不是由服务端一直 hold，直到配置变更再返回，但可能有读者还会有疑问，为什么不由客户端控制超时，服务端去除掉定时器，这样客户端超时后重新发起下一次长轮询，这样的设计不是更简单吗？无论是 Nacos 还是 Apollo 都有这样的定时器，而不是靠客户端控制超时，这样做主要有两点考虑：

- 和真正的客户端超时区分开。
- 仅仅使用异常（Exception）来表达异常流，而不应该用异常来表达正常的业务流。304 不是超时异常，而是长轮询中配置未变更的一种正常流程，不应该使用超时异常来表达。

客户端超时需要单独配置，且需要比服务端长轮询的超时要长。正如上述的 demo 中客户端超时设置的是 40s，服务端判断一次长轮询超时是 30s。这两个值在 Nacos 中默认是 30s 和 29.5s，在 Apollo 中默认是是 90s 和 60s。 

### 长轮询包含多组 dataId

在上述的 demo 中，一个 dataId 会发起一次长轮询，在实际配置中心的设计中肯定不能这样设计，一般的优化方式是，一批 dataId 组成一个组批量包含在一个长轮询任务中。在 Nacos 中，按照 3000 个 dataId 为一组包装成一个长轮询任务。

## 长轮询和长连接

讲完实现细节，本文最核心的部分已经介绍完了。再回到最前面提到的数据交互模式上提到的推模型和拉模型，其实在写这篇文章时，我曾经问过交流群中的小伙伴们“配置中心实现动态推送的原理”，他们中绝大多数人认为是长连接的推模型。然而事实上，主流的配置中心几乎都是使用了本文介绍的长轮询方案，这又是为什么呢？

我也翻阅了不少博客，显然他们给出的理由并不能说服我，我尝试着从自己的角度分析了一下这个既定的事实。

1. 长轮询实现起来比较容易，完全依赖于 HTTP 便可以实现全部逻辑，而 HTTP 是最能够被大众接受的通信方式。
2. 长轮询使用 HTTP，便于多语言客户端的编写，大多数语言都有 HTTP 的客户端。

那么长连接是不是真的就不适合用于配置中心场景呢？有人可能会认为维护一条长连接会消耗大量资源，而长轮询可以提升系统的吞吐量，而在配置中心场景，这一假设并没有实际的压测数据能够论证，benchmark everything！please~

另外，翻阅了一下 Nacos 2.0 的 milestone，我发现了一个有意思的规划，Nacos 的注册中心（目前是短轮询 + udp 推送）和配置中心（目前是长轮询）都有计划改造为长连接模式。

再回过头来看，长轮询实现已经将配置中心这个组件支撑的足够好了，替换成长连接，一定需要找到合适的理由才行。

## 总结

1. 本文介绍了长轮询、轮询、长连接这几种数据交互模型的差异性。
2. 分析了 Nacos 和 Apollo 等主流配置中心均是通过长轮询的方式实现配置的实时推送的。实时感知建立在客户端拉的基础上，因为本质上还是通过 HTTP 进行的数据交互，之所以有“推”的感觉，是因为服务端 hold 住了客户端的响应体，并且在配置变更后主动写入了返回 response 对象再进行返回。
3. 通过一个简单的 demo，实现了长轮询配置实时推送的过程演示，本文的 demo 示例存放在：https://github.com/lexburner/longPolling-demo
