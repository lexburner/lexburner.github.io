---
title: 深入理解 RPC 之集群篇
date: 2018-02-27 22:18:51
tags:
- RPC
categories:
- RPC
toc: true
---

上一篇文章分析了服务的注册与发现，这一篇文章着重分析下 RPC 框架都会用到的集群的相关知识。

集群 (Cluster) 本身并不具备太多知识点，在分布式系统中，集群一般涵盖了负载均衡（LoadBalance），高可用（HA），路由（Route）等等概念，每个 RPC 框架对集群支持的程度不同，本文着重分析前两者 -- 负载均衡和高可用。

<!-- more -->

## 集群概述

在此之前的《深入理解 RPC》系列文章，对 RPC 的分析着重还是放在服务之间的点对点调用，而分布式服务中每个服务必然不止一个实例，不同服务的实例和相同服务的多个实例构成了一个错综复杂的分布式环境，在服务治理框架中正是借助了 Cluster 这一层来应对这一难题。还是以博主较为熟悉的 motan 这个框架来介绍 Cluster 的作用。

先来看看 Cluster 的顶层接口：

```java
@Spi(scope = Scope.PROTOTYPE)
public interface Cluster<T> extends Caller<T> {
    @Override
    void init();
    void setUrl(URL url);
    void setLoadBalance(LoadBalance<T> loadBalance);//<1>
    void setHaStrategy(HaStrategy<T> haStrategy);//<2>
    void onRefresh(List<Referer<T>> referers);
    List<Referer<T>> getReferers();
    LoadBalance<T> getLoadBalance();
}
```

在概述中，我们只关心 Cluster 接口中的两个方法，它揭示了 Cluster 在服务治理中的地位

<1> 指定负载均衡算法

<2> 指定高可用策略（容错机制） 

![https://image.cnkirito.cn/TIM%E5%9B%BE%E7%89%8720180227151838.png](https://image.cnkirito.cn/TIM%E5%9B%BE%E7%89%8720180227151838.png)

我们需要对所谓的负载均衡策略和高可用策略有一定的理解，才能够搞清楚集群是如何运作的。

## 负载均衡

说到负载均衡，大多数人可能立刻联想到了 nginx。负载均衡可以分为服务端负载均衡和客户端负载均衡，而服务端负载均衡又按照实现方式的不同可以划分为软件负载均衡和硬件负载均衡，nginx 便是典型的软件负载均衡。而我们今天所要介绍的 RPC 中的负载均衡则主要是客户端负载均衡。如何区分也很简单，用笔者自己的话来描述下

> 在 RPC 调用中，客户端持有所有的服务端节点引用，自行通过负载均衡算法选择一个节点进行访问，这便是客户端负载均衡。

客户端如何获取到所有的服务端节点引用呢？一般是通过配置的方式，或者是从上一篇文章介绍的服务注册与发现组件中获取。

## 负载均衡接口分析

motan 中的负载均衡抽象：

```java
@Spi(scope = Scope.PROTOTYPE)
public interface LoadBalance<T> {
    void onRefresh(List<Referer<T>> referers);
    Referer<T> select(Request request);//<1>
    void selectToHolder(Request request, List<Referer<T>> refersHolder);
    void setWeightString(String weightString);
}
```

ribbon 中的负载均衡抽象：

```java
public interface IRule{
    public Server choose(Object key);//<1>
    public void setLoadBalancer(ILoadBalancer lb);
    public ILoadBalancer getLoadBalancer();
}
```

<1> 对比下两个 RPC 框架对负载均衡的抽象可以发现，其实负载均衡策略干的事很简单，就是根据请求返回一个服务节点。在 motan 中对服务端的点对点调用抽象成了 Referer，而在 ribbon 中则是 Server。

## 几种负载均衡算法

负载均衡算法有几种经典实现，已经是老生常谈了，总结后主要有如下几个：

1. 轮询（Round Robin）
2. 加权轮询（Weight Round Robin）
3. 随机（Random）
4. 加权随机（Weight Random）
5. 源地址哈希（Hash）
6. 一致性哈希（ConsistentHash）
7. 最小连接数（Least Connections）
8. 低并发优先（Active Weight）

每个框架支持的实现都不太一样，如 **ribbon 支持的负载均衡策略 **：

| 策略名                       | 策略描述                                     | 实现说明                                     |
| ------------------------- | ---------------------------------------- | ---------------------------------------- |
| BestAvailableRule         | 选择一个最小并发请求的 server                       | 逐个考察 Server，如果 Server 被 tripped 了，则忽略，在选择其中 ActiveRequestsCount 最小的 server |
| AvailabilityFilteringRule | 过滤掉那些因为一直连接失败的被标记为 circuit tripped 的后端 server，并过滤掉那些高并发的的后端 server（active connections 超过配置的阈值） | 使用一个 AvailabilityPredicate 来包含过滤 server 的逻辑，其实就就是检查 status 里记录的各个 server 的运行状态 |
| WeightedResponseTimeRule  | 根据响应时间分配一个 weight，响应时间越长，weight 越小，被选中的可能性越低。 | 一个后台线程定期的从 status 里面读取评价响应时间，为每个 server 计算一个 weight。Weight 的计算也比较简单 responsetime 减去每个 server 自己平均的 responsetime 是 server 的权重。当刚开始运行，没有形成 status 时，使用 RoundRobinRule 策略选择 server。 |
| RetryRule                 | 对选定的负载均衡策略机上重试机制。                        | 在一个配置时间段内当选择 server 不成功，则一直尝试使用 subRule 的方式选择一个可用的 server |
| RoundRobinRule            | roundRobin 方式轮询选择 server                 | 轮询 index，选择 index 对应位置的 server           |
| RandomRule                | 随机选择一个 server                            | 在 index 上随机，选择 index 对应位置的 server        |
| ZoneAvoidanceRule         | 复合判断 server 所在区域的性能和 server 的可用性选择 server | 使用 ZoneAvoidancePredicate 和 AvailabilityPredicate 来判断是否选择某个 server，前一个判断判定一个 zone 的运行性能是否可用，剔除不可用的 zone（的所有 server），AvailabilityPredicate 用于过滤掉连接数过多的 Server。 |

**motan 支持的负载均衡策略 **：

| 策略名                | 策略描述                                     |
| ------------------ | ---------------------------------------- |
| Random             | 随机选择一个 server                            |
| RoundRobin         | roundRobin 方式轮询选择 server                 |
| ConsistentHash     | 一致性 Hash，保证同一源地址的请求落到同一个服务端，能够应对服务端机器的动态上下线 (实际上并没有严格做到一致性 hash，motan 的实现只能满足粘滞 hash，只保证 server 节点变更周期内相同对请求落在相同的 server 上，比较适合用在二级缓存场景) |
| LocalFirst         | 当 server 列表中包含本地暴露的可用服务时，优先使用此服务。否则使用低并发优先 ActiveWeight 负载均衡策略 |
| ActiveWeight       | 并发量越小的 server，优先级越高                      |
| ConfigurableWeight | 加权随机                                     |

算法很多，有些负载均衡算法的实现复杂度也很高，请教了一些朋友，发现用的最多还是 RoundRobin，Random 这两种。可能和他们实现起来很简单有关，很多运用到 RPC 框架的项目也都是保持了默认配置。

而这两种经典复杂均衡算法实现起来是很简单的，在此给出网上的简易实现，方便大家更直观的了解。

** 服务列表 **

```java
public class IpMap
{
    // 待路由的 Ip 列表，Key 代表 Ip，Value 代表该 Ip 的权重
    public static HashMap<String, Integer> serverWeightMap = 
            new HashMap<String, Integer>();
    static
    {
        serverWeightMap.put("192.168.1.100", 1);
        serverWeightMap.put("192.168.1.101", 1);
        // 权重为 4
        serverWeightMap.put("192.168.1.102", 4);
        serverWeightMap.put("192.168.1.103", 1);
        serverWeightMap.put("192.168.1.104", 1);
        // 权重为 3
        serverWeightMap.put("192.168.1.105", 3);
        serverWeightMap.put("192.168.1.106", 1);
        // 权重为 2
        serverWeightMap.put("192.168.1.107", 2);
        serverWeightMap.put("192.168.1.108", 1);
        serverWeightMap.put("192.168.1.109", 1);
        serverWeightMap.put("192.168.1.110", 1);
    }
}
```

** 轮询（Round Robin）**

```java
public class RoundRobin
{
    private static Integer pos = 0;
    
    public static String getServer()
    {
        // 重建一个 Map，避免服务器的上下线导致的并发问题
        Map<String, Integer> serverMap = 
                new HashMap<String, Integer>();
        serverMap.putAll(IpMap.serverWeightMap);
        
        // 取得 Ip 地址 List
        Set<String> keySet = serverMap.keySet();
        ArrayList<String> keyList = new ArrayList<String>();
        keyList.addAll(keySet);
        
        String server = null;
        synchronized (pos)
        {
            if (pos > keySet.size())
                pos = 0;
            server = keyList.get(pos);
            pos ++;
        }
        
        return server;
    }
}
```

** 随机（Random）**

```java
public class Random
{
    public static String getServer()
    {
        // 重建一个 Map，避免服务器的上下线导致的并发问题
        Map<String, Integer> serverMap = 
                new HashMap<String, Integer>();
        serverMap.putAll(IpMap.serverWeightMap);
        
        // 取得 Ip 地址 List
        Set<String> keySet = serverMap.keySet();
        ArrayList<String> keyList = new ArrayList<String>();
        keyList.addAll(keySet);
        
        java.util.Random random = new java.util.Random();
        int randomPos = random.nextInt(keyList.size());
        
        return keyList.get(randomPos);
    }
}
```

## 高可用策略

高可用（HA）策略一般也被称作容错机制，分布式系统中出错是常态，但服务却不能停止响应，6 个 9 一直是各个公司的努力方向。当一次请求失败之后，是重试呢？还是继续请求其他机器？抑或是记录下这次失败？下面是集群中的几种常用高可用策略：

1. 失效转移（failover）

   当出现失败，重试其他服务器，通常用于读操作等幂等行为，重试会带来更长延迟。该高可用策略会受到负载均衡算法的限制，比如失效转移强调需要重试其他机器，但一致性 Hash 这类负载均衡算法便会与其存在冲突（个人认为一致性 Hash 在 RPC 的客户端负载均衡中意义不是很大）

2. 快速失败（failfast）

   只发起一次调用，失败立即报错，通常用于非幂等性的写操作。

   如果在 motan，dubbo 等配置中设置了重试次数 >0，又配置了该高可用策略，则重试效果也不会生效，由此可见集群中的各个配置可能是会相互影响的。

3. 失效安全（failsafe）

   出现异常时忽略，但记录这一次失败，存入日志中。

4. 失效自动恢复（failback）

   后台记录失败请求，定时重发。通常用于消息通知操作。

5. 并行调用（forking）

   只要一个成功即返回，通常用于实时性要求较高的读操作。需要牺牲一定的服务资源。

6. 广播（broadcast）

   广播调用，所有提供逐个调用，任意一台报错则报错。通常用于更新提供方本地状态，速度慢，任意一台报错则报错。

## 高可用接口分析

以 motan 的 HaStrategy 为例来介绍高可用在集群中的实现细节

```java
@Spi(scope = Scope.PROTOTYPE)
public interface HaStrategy<T> {
    void setUrl(URL url);
    Response call(Request request, LoadBalance<T> loadBalance);//<1>
}
```

<1> 如我之前所述，高可用策略依赖于请求和一个特定的负载均衡算法，返回一个响应。

** 快速失败（failfast）**

```java
@SpiMeta(name = "failfast")
public class FailfastHaStrategy<T> extends AbstractHaStrategy<T> {

    @Override
    public Response call(Request request, LoadBalance<T> loadBalance) {
        Referer<T> refer = loadBalance.select(request);
        return refer.call(request);
    }
}
```

motan 实现了两个高可用策略，其一便是 failfast，非常简单，只进行一次负载均衡节点的选取，接着发起点对点的调用。

** 失效转移（failover）**

```java
@SpiMeta(name = "failover")
public class FailoverHaStrategy<T> extends AbstractHaStrategy<T> {

    protected ThreadLocal<List<Referer<T>>> referersHolder = new ThreadLocal<List<Referer<T>>>() {
        @Override
        protected java.util.List<com.weibo.api.motan.rpc.Referer<T>> initialValue() {
            return new ArrayList<Referer<T>>();
        }
    };

    @Override
    public Response call(Request request, LoadBalance<T> loadBalance) {

        List<Referer<T>> referers = selectReferers(request, loadBalance);
        if (referers.isEmpty()) {
            throw new MotanServiceException(String.format("FailoverHaStrategy No referers for request:%s, loadbalance:%s", request,
                    loadBalance));
        }
        URL refUrl = referers.get(0).getUrl();
        // 先使用 method 的配置
        int tryCount =
                refUrl.getMethodParameter(request.getMethodName(), request.getParamtersDesc(), URLParamType.retries.getName(),
                        URLParamType.retries.getIntValue());
        // 如果有问题，则设置为不重试
        if (tryCount < 0) {
            tryCount = 0;
        }
	   // 只有 failover 策略才会有重试
        for (int i = 0; i <= tryCount; i++) {
            Referer<T> refer = referers.get(i % referers.size());
            try {
                request.setRetries(i);
                return refer.call(request);
            } catch (RuntimeException e) {
                // 对于业务异常，直接抛出
                if (ExceptionUtil.isBizException(e)) {
                    throw e;
                } else if (i >= tryCount) {
                    throw e;
                }
                LoggerUtil.warn(String.format("FailoverHaStrategy Call false for request:%s error=%s", request, e.getMessage()));
            }
        }

        throw new MotanFrameworkException("FailoverHaStrategy.call should not come here!");
    }

    protected List<Referer<T>> selectReferers(Request request, LoadBalance<T> loadBalance) {
        List<Referer<T>> referers = referersHolder.get();
        referers.clear();
        loadBalance.selectToHolder(request, referers);
        return referers;
    }

}
```

其二的高可用策略是 failover，实现相对复杂一些，容忍在重试次数内的失败调用。这也是 motan 提供的默认策略。

## 其他集群相关的知识点

在 Dubbo 中也有 cluster 这一分层，除了 loadbalance 和 ha 这两层之外还包含了路由（Router）用来做读写分离，应用隔离；合并结果（Merger）用来做响应结果的分组聚合。

在 SpringCloud-Netflix 中整合了 Zuul 来做服务端的负载均衡

## 参考资料

1. [几种简单的负载均衡算法及其 Java 代码实现](http://www.cnblogs.com/xrq730/p/5154340.html)
2. [搜索业务和技术介绍及容错机制](https://www.cnblogs.com/xiexj/p/7071939.html)
