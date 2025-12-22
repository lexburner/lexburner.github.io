---
title: 研究优雅停机时的一点思考
date: 2018-01-14 20:16:28
tags: 
- JAVA
categories:
  - 微服务
toc: true
---

> 开头先废话几句，有段时间没有更新博客了，除了公司项目比较忙之外，还有个原因就是开始思考如何更好地写作。远的来说，我从大一便开始在 CSDN 上写博客，回头看那时的文笔还很稚嫩，一心想着反正只有自己看，所以更多的是随性发挥，随意吐槽，内容也很简陋：刷完一道算法题记录下解题思路，用 JAVA 写完一个 demo 之后，记录下配置步骤。近的来看，工作之后开始维护自己的博客站点: www.cnkirito.moe 也会同步更新自己公众号。相比圈子里其他前辈来说，读者会少很多，但毕竟有人看，每次动笔之前便会开始思考一些事。除了给自己的学习经历做一个归档，还多了一些顾虑：会不会把知识点写错？会不会误人子弟？自己的理解会不会比较片面，不够深刻？等等等等。但自己的心路历程真的发生了一些改变。在我还是个小白的时候，学习技术：第一个想法是百度，搜别人的博客，一步步跟着别人后面配置，把 demo run 起来。而现在，遇到问题的第一思路变成了：源码 debug，官方文档。我便开始思考官方文档和博客的区别，官方文档的优势除了更加全面之外，还有就是：“它只教你怎么做”，对于一个有经验有阅历的程序员来说，这反而是好事，这可以让你有自己的思考。而博客则不一样，如果这个博主特别爱 BB，便会产生很多废话（就像本文的第一段），它会有很多作者自己思考的产物，一方面它比官方文档更容易出错，更容易片面，一方面它比官方文档更容易启发人，特别是读到触动到我的好文时，会抑制不住内心的喜悦想要加到作者的好友，这便是共情。我之后的文章也会朝着这些点去努力：不避重就轻，多思考不想当然，求精。

最近瞥了一眼项目的重启脚本，发现运维一直在使用 `kill -9 <pid>` 的方式重启 springboot embedded tomcat，其实大家几乎一致认为：`kill -9 <pid>` 的方式比较暴力，但究竟会带来什么问题却很少有人能分析出个头绪。这篇文章主要记录下自己的思考过程。

## kill -9 和 kill -15 有什么区别？

在以前，我们发布 WEB 应用通常的步骤是将代码打成 war 包，然后丢到一个配置好了应用容器（如 Tomcat，Weblogic）的 Linux 机器上，这时候我们想要启动 / 关闭应用，方式很简单，运行其中的启动 / 关闭脚本即可。而 springboot 提供了另一种方式，将整个应用连同内置的 tomcat 服务器一起打包，这无疑给发布应用带来了很大的便捷性，与之而来也产生了一个问题：如何关闭 springboot 应用呢？一个显而易见的做法便是，根据应用名找到进程 id，杀死进程 id 即可达到关闭应用的效果。

上述的场景描述引出了我的疑问：怎么优雅地杀死一个 springboot 应用进程呢？这里仅仅以最常用的 Linux 操作系统为例，在 Linux 中 kill 指令负责杀死进程，其后可以紧跟一个数字，代表 ** 信号编号 **(Signal)，执行 `kill -l` 指令，可以一览所有的信号编号。

<!-- more -->

```shell
xu@ntzyz-qcloud ~ % kill -l                                                                     
HUP INT QUIT ILL TRAP ABRT BUS FPE KILL USR1 SEGV USR2 PIPE ALRM TERM STKFLT CHLD CONT STOP TSTP TTIN TTOU URG XCPU XFSZ VTALRM PROF WINCH POLL PWR SYS
```

本文主要介绍下第 9 个信号编码 `KILL`，以及第 15 个信号编号 `TERM` 。

先简单理解下这两者的区别：`kill -9 pid` 可以理解为操作系统从内核级别强行杀死某个进程，`kill -15 pid` 则可以理解为发送一个通知，告知应用主动关闭。这么对比还是有点抽象，那我们就从应用的表现来看看，这两个命令杀死应用到底有啥区别。

** 代码准备 **

由于笔者 springboot 接触较多，所以以一个简易的 springboot 应用为例展开讨论，添加如下代码。

1 增加一个实现了 DisposableBean 接口的类

```java
@Component
public class TestDisposableBean implements DisposableBean{
    @Override
    public void destroy() throws Exception {
        System.out.println("测试 Bean 已销毁 ...");
    }
}
```

2 增加 JVM 关闭时的钩子

```java
@SpringBootApplication
@RestController
public class TestShutdownApplication implements DisposableBean {

    public static void main(String[] args) {
        SpringApplication.run(TestShutdownApplication.class, args);
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println("执行 ShutdownHook ...");
            }
        }));
    }
}
```

** 测试步骤 **

1. 执行 `java -jar test-shutdown-1.0.jar` 将应用运行起来
2. 测试 `kill -9 pid`，`kill -15 pid`，`ctrl + c` 后输出日志内容

** 测试结果 **

`kill -15 pid` & `ctrl + c`，效果一样，输出结果如下

```
2018-01-14 16:55:32.424  INFO 8762 --- [Thread-3] ationConfigEmbeddedWebApplicationContext : Closing org.springframework.boot.context.embedded.AnnotationConfigEmbeddedWebApplicationContext@2cdf8d8a: startup date [Sun Jan 14 16:55:24 UTC 2018]; root of context hierarchy
2018-01-14 16:55:32.432  INFO 8762 --- [Thread-3] o.s.j.e.a.AnnotationMBeanExporter        : Unregistering JMX-exposed beans on shutdown
执行 ShutdownHook ...
测试 Bean 已销毁 ...
java -jar test-shutdown-1.0.jar  7.46s user 0.30s system 80% cpu 9.674 total
```

`kill -9 pid`，没有输出任何应用日志

```
[1]    8802 killed     java -jar test-shutdown-1.0.jar
java -jar test-shutdown-1.0.jar  7.74s user 0.25s system 41% cpu 19.272 total
```

可以发现，kill -9 pid 是给应用杀了个措手不及，没有留给应用任何反应的机会。而反观 kill -15 pid，则比较优雅，先是由 `AnnotationConfigEmbeddedWebApplicationContext` （一个 ApplicationContext 的实现类）收到了通知，紧接着执行了测试代码中的 Shutdown Hook，最后执行了 DisposableBean#destory() 方法。孰优孰劣，立判高下。

一般我们会在应用关闭时处理一下“善后”的逻辑，比如

1. 关闭 socket 链接
2. 清理临时文件
3. 发送消息通知给订阅方，告知自己下线
4. 将自己将要被销毁的消息通知给子进程
5. 各种资源的释放

等等

而 kill -9 pid 则是直接模拟了一次系统宕机，系统断电，这对于应用来说太不友好了，不要用收割机来修剪花盆里的花。取而代之，便是使用 kill -15 pid 来代替。如果在某次实际操作中发现：kill -15 pid 无法关闭应用，则可以考虑使用内核级别的 kill -9 pid ，但请事后务必排查出是什么原因导致 kill -15 pid 无法关闭。

## springboot 如何处理 -15 TERM Signal

上面解释过了，使用 kill -15 pid 的方式可以比较优雅的关闭 springboot 应用，我们可能有以下的疑惑： springboot/spring 是如何响应这一关闭行为的呢？是先关闭了 tomcat，紧接着退出 JVM，还是相反的次序？它们又是如何互相关联的？

尝试从日志开始着手分析，`AnnotationConfigEmbeddedWebApplicationContext` 打印出了 Closing 的行为，直接去源码中一探究竟，最终在其父类 `AbstractApplicationContext` 中找到了关键的代码：

```java
@Override
public void registerShutdownHook() {
  if (this.shutdownHook == null) {
    this.shutdownHook = new Thread() {
      @Override
      public void run() {
        synchronized (startupShutdownMonitor) {
          doClose();
        }
      }
    };
    Runtime.getRuntime().addShutdownHook(this.shutdownHook);
  }
}

@Override
public void close() {
   synchronized (this.startupShutdownMonitor) {
      doClose();
      if (this.shutdownHook != null) {
         Runtime.getRuntime().removeShutdownHook(this.shutdownHook);
      }
   }
}

protected void doClose() {
   if (this.active.get() && this.closed.compareAndSet(false, true)) {
      LiveBeansView.unregisterApplicationContext(this);
      // 发布应用内的关闭事件
      publishEvent(new ContextClosedEvent(this));
      // Stop all Lifecycle beans, to avoid delays during individual destruction.
      if (this.lifecycleProcessor != null) {
         this.lifecycleProcessor.onClose();
      }
      // spring 的 BeanFactory 可能会缓存单例的 Bean 
      destroyBeans();
      // 关闭应用上下文 &BeanFactory
      closeBeanFactory();
      // 执行子类的关闭逻辑
      onClose();
      this.active.set(false);
   }
}
```

为了方便排版以及便于理解，我去除了源码中的部分异常处理代码，并添加了相关的注释。在容器初始化时，ApplicationContext 便已经注册了一个 Shutdown Hook，这个钩子调用了 Close()方法，于是当我们执行 kill -15 pid 时，JVM 接收到关闭指令，触发了这个 Shutdown Hook，进而由 Close() 方法去处理一些善后手段。具体的善后手段有哪些，则完全依赖于 ApplicationContext 的 doClose() 逻辑，包括了注释中提及的销毁缓存单例对象，发布 close 事件，关闭应用上下文等等，特别的，当 ApplicationContext 的实现类是 AnnotationConfigEmbeddedWebApplicationContext 时，还会处理一些 tomcat/jetty 一类内置应用服务器关闭的逻辑。

窥见了 springboot 内部的这些细节，更加应该了解到优雅关闭应用的必要性。JAVA 和 C 都提供了对 Signal 的封装，我们也可以手动捕获操作系统的这些 Signal，在此不做过多介绍，有兴趣的朋友可以自己尝试捕获下。

## 还有其他优雅关闭应用的方式吗？

spring-boot-starter-actuator 模块提供了一个 restful 接口，用于优雅停机。

** 添加依赖 **

```xml
<dependency>
   <groupId>org.springframework.boot</groupId>
   <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

** 添加配置 **

```properties
#启用 shutdown
endpoints.shutdown.enabled=true
#禁用密码验证
endpoints.shutdown.sensitive=false
```

生产中请注意该端口需要设置权限，如配合 spring-security 使用。

执行 `curl -X POST host:port/shutdown` 指令，关闭成功便可以获得如下的返回：

```json
{"message":"Shutting down, bye..."}
```

虽然 springboot 提供了这样的方式，但按我目前的了解，没见到有人用这种方式停机，kill -15 pid 的方式达到的效果与此相同，将其列于此处只是为了方案的完整性。

## 如何销毁作为成员变量的线程池？

尽管 JVM 关闭时会帮我们回收一定的资源，但一些服务如果大量使用异步回调，定时任务，处理不当很有可能会导致业务出现问题，在这其中，线程池如何关闭是一个比较典型的问题。

```java
@Service
public class SomeService {
    ExecutorService executorService = Executors.newFixedThreadPool(10);
    public void concurrentExecute() {
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                System.out.println("executed...");
            }
        });
    }
}
```

我们需要想办法在应用关闭时（JVM 关闭，容器停止运行），关闭线程池。

初始方案：什么都不做。在一般情况下，这不会有什么大问题，因为 JVM 关闭，会释放之，但显然没有做到本文一直在强调的两个字，没错 ---- 优雅。

方法一的弊端在于线程池中提交的任务以及阻塞队列中未执行的任务变得极其不可控，接收到停机指令后是立刻退出？还是等待任务执行完成？抑或是等待一定时间任务还没执行完成则关闭？

方案改进：

发现初始方案的劣势后，我立刻想到了使用 DisposableBean 接口，像这样：

```java
@Service
public class SomeService implements DisposableBean{

    ExecutorService executorService = Executors.newFixedThreadPool(10);

    public void concurrentExecute() {
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                System.out.println("executed...");
            }
        });
    }

    @Override
    public void destroy() throws Exception {
        executorService.shutdownNow();
        //executorService.shutdown();
    }
}
```

紧接着问题又来了，是 shutdown 还是 shutdownNow 呢？这两个方法还是经常被误用的，简单对比这两个方法。

ThreadPoolExecutor 在 shutdown 之后会变成 SHUTDOWN 状态，无法接受新的任务，随后等待正在执行的任务执行完成。意味着，shutdown 只是发出一个命令，至于有没有关闭还是得看线程自己。

ThreadPoolExecutor 对于 shutdownNow 的处理则不太一样，方法执行之后变成 STOP 状态，并对执行中的线程调用 Thread.interrupt() 方法（但如果线程未处理中断，则不会有任何事发生），所以并不代表“立刻关闭”。

查看 shutdown 和 shutdownNow 的 java doc，会发现如下的提示：

> shutdown()：Initiates an orderly shutdown in which previously submitted tasks are executed, but no new tasks will be accepted.Invocation has no additional effect if already shut down.This method does not wait for previously submitted tasks to complete execution.Use {@link #awaitTermination awaitTermination} to do that.
>
> shutdownNow()：Attempts to stop all actively executing tasks, halts the processing of waiting tasks, and returns a list of the tasks that were awaiting execution. These tasks are drained (removed) from the task queue upon return from this method.This method does not wait for actively executing tasks to terminate.  Use {@link #awaitTermination awaitTermination} to do that.There are no guarantees beyond best-effort attempts to stop processing actively executing tasks.  This implementation cancels tasks via {@link Thread#interrupt}, so any task that fails to respond to interrupts may never terminate.

两者都提示我们需要额外执行 awaitTermination 方法，仅仅执行 shutdown/shutdownNow 是不够的。

最终方案：参考 spring 中线程池的回收策略，我们得到了最终的解决方案。

```java
public abstract class ExecutorConfigurationSupport extends CustomizableThreadFactory
      implements DisposableBean{
    @Override
	public void destroy() {
		shutdown();
	}

	/**
	 * Perform a shutdown on the underlying ExecutorService.
	 * @see java.util.concurrent.ExecutorService#shutdown()
	 * @see java.util.concurrent.ExecutorService#shutdownNow()
	 * @see #awaitTerminationIfNecessary()
	 */
	public void shutdown() {
		if (this.waitForTasksToCompleteOnShutdown) {
			this.executor.shutdown();
		}
		else {
			this.executor.shutdownNow();
		}
		awaitTerminationIfNecessary();
	}

	/**
	 * Wait for the executor to terminate, according to the value of the
	 * {@link #setAwaitTerminationSeconds "awaitTerminationSeconds"} property.
	 */
	private void awaitTerminationIfNecessary() {
		if (this.awaitTerminationSeconds > 0) {
			try {
				this.executor.awaitTermination(this.awaitTerminationSeconds, TimeUnit.SECONDS));
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
			}
		}
	}
}
```

保留了注释，去除了一些日志代码，一个优雅关闭线程池的方案呈现在我们的眼前。

1 通过 waitForTasksToCompleteOnShutdown 标志来控制是想立刻终止所有任务，还是等待任务执行完成后退出。

2  executor.awaitTermination(this.awaitTerminationSeconds, TimeUnit.SECONDS)); 控制等待的时间，防止任务无限期的运行（前面已经强调过了，即使是 shutdownNow 也不能保证线程一定停止运行）。

## 更多需要我们的思考的优雅停机策略

在我们分析 RPC 原理的系列文章里面曾经提到，服务治理框架一般会考虑到优雅停机的问题。通常的做法是事先隔断流量，接着关闭应用。常见的做法是将服务节点从注册中心摘除，订阅者接收通知，移除节点，从而优雅停机；涉及到数据库操作，则可以使用事务的 ACID 特性来保证即使 crash 停机也能保证不出现异常数据，正常下线则更不用说了；又比如消息队列可以依靠 ACK 机制 + 消息持久化，或者是事务消息保障；定时任务较多的服务，处理下线则特别需要注意优雅停机的问题，因为这是一个长时间运行的服务，比其他情况更容易受停机问题的影响，可以使用幂等和标志位的方式来设计定时任务...

事务和 ACK 这类特性的支持，即使是宕机，停电，kill -9 pid 等情况，也可以使服务尽量可靠；而同样需要我们思考的还有 kill -15 pid，正常下线等情况下的停机策略。最后再补充下整理这个问题时，自己对 jvm shutdown hook 的一些理解。

> When the virtual machine begins its shutdown sequence it will start all registered shutdown hooks in some unspecified order and let them run concurrently. **When all the hooks have finished it will then run all uninvoked finalizers if finalization-on-exit has been enabled. Finally, the virtual machine will halt.**

shutdown hook 会保证 JVM 一直运行，知道 hook 终止 (terminated)。这也启示我们，如果接收到 kill -15 pid 命令时，执行阻塞操作，可以做到等待任务执行完成之后再关闭 JVM。同时，也解释了一些应用执行 kill -15 pid 无法退出的问题，没错，中断被阻塞了。

参考资料

[1] https://stackoverflow.com/questions/2921945/useful-example-of-a-shutdown-hook-in-java

[2] spring 源码

[3] jdk 文档
