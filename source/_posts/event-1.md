---
title: 浅析Spring中的事件驱动机制
date: 2017-09-10 20:03:58
tags:
- 架构设计
- Spring
categories:
- Spring
---

今天来简单地聊聊事件驱动，其实写这篇文章挺令我挺苦恼的，因为事件驱动这个名词，我没有找到很好的定性解释，担心自己的表述有误，而说到事件驱动可能立刻联想到如此众多的概念：观察者模式，发布订阅模式，消息队列MQ，消息驱动，事件，EventSourcing...为了不产生歧义，笔者把自己所了解的这些模棱两可的概念都列了出来，再开始今天的分享。

- 在设计模式中，观察者模式可以算得上是一个非常经典的行为型设计模式，猫叫了，主人醒了，老鼠跑了，这一经典的例子，是事件驱动模型在设计层面的体现。
- 另一模式，发布订阅模式往往被人们等同于观察者模式，但我的理解是两者唯一区别，是发布订阅模式需要有一个调度中心，而观察者模式不需要，例如观察者的列表可以直接由被观察者维护。不过两者即使被混用，互相替代，通常不影响表达。
- MQ，中间件级别的消息队列（e.g. ActiveMQ,RabbitMQ），可以认为是发布订阅模式的一个具体体现。事件驱动->发布订阅->MQ，从抽象到具体。
- java和spring中都拥有Event的抽象，分别代表了语言级别和三方框架级别对事件的支持。
- EventSourcing这个概念就要关联到领域驱动设计，DDD对事件驱动也是非常地青睐，领域对象的状态完全是由事件驱动来控制，由其衍生出了CQRS架构，具体实现框架有*Axon*Framework。
- Nginx可以作为高性能的应用服务器（e.g. openResty），以及Nodejs事件驱动的特性，这些也是都是事件驱动的体现。

本文涵盖的内容主要是前面4点。

## Spring对Event的支持

Spring的文档对Event的支持翻译之后描述如下：

> ApplicationContext通过ApplicationEvent类和ApplicationListener接口进行事件处理。 如果将实现ApplicationListener接口的bean注入到上下文中，则每次使用ApplicationContext发布ApplicationEvent时，都会通知该bean。 本质上，这是标准的观察者设计模式。

而在spring4.2之后，提供了注解式的支持，我们可以使用任意的java对象配合注解达到同样的效果，首先来看看不适用注解如何在Spring中使用事件驱动机制。

定义业务需求：用户注册后，系统需要给用户发送邮件告知用户注册成功，需要给用户初始化积分；隐含的设计需求，用户注册后，后续需求可能会添加其他操作，如再发送一条短信等等，希望程序具有扩展性，以及符合开闭原则。

如果不使用事件驱动，代码可能会像这样子：

```java
public class UserService {
  
    @Autowired
    EmailService emailService;
    @Autowired
    ScoreService scoreService;
    @Autowired
    OtherService otherService;

    public void register(String name) {
        System.out.println("用户：" + name + " 已注册！");
        emailService.sendEmail(name);
        scoreService.initScore(name);
        otherService.execute(name);
    }
  
}
```

要说有什么毛病，其实也不算有，因为可能大多数人在开发中都会这么写，喜欢写同步代码。但这么写，实际上并不是特别的符合隐含的设计需求，假设增加更多的注册项service，我们需要修改register的方法，并且让UserService注入对应的Service。而实际上，register并不关心这些“额外”的操作，如何将这些多余的代码抽取出去呢？便可以使用Spring提供的Event机制。

### 定义用户注册事件

```java
public class UserRegisterEvent extends ApplicationEvent{

    public UserRegisterEvent(String name) { //name即source
        super(name);
    }

}
```

ApplicationEvent是由Spring提供的所有Event类的基类，为了简单起见，注册事件只传递了name（可以复杂的对象，但注意要了解清楚序列化机制）。

### 定义用户注册服务(事件发布者)

```java
@Service // <1>
public class UserService implements ApplicationEventPublisherAware { // <2>

    public void register(String name) {
        System.out.println("用户：" + name + " 已注册！");
        applicationEventPublisher.publishEvent(new UserRegisterEvent(name));// <3>
    }

    private ApplicationEventPublisher applicationEventPublisher; // <2>

    @Override
    public void setApplicationEventPublisher(ApplicationEventPublisher applicationEventPublisher) { // <2>
        this.applicationEventPublisher = applicationEventPublisher;
    }
}
```

<1> 服务必须交给Spring容器托管

<2> ApplicationEventPublisherAware是由Spring提供的用于为Service注入ApplicationEventPublisher事件发布器的接口，使用这个接口，我们自己的Service就拥有了发布事件的能力。

<3> 用户注册后，不再是显示调用其他的业务Service，而是发布一个用户注册事件。

### 定义邮件服务，积分服务，其他服务(事件订阅者)

```java
@Service // <1>
public class EmailService implements ApplicationListener<UserRegisterEvent> { // <2>

    @Override
    public void onApplicationEvent(UserRegisterEvent userRegisterEvent) {
        System.out.println("邮件服务接到通知，给 " + userRegisterEvent.getSource() + " 发送邮件...");// <3>
    }
}
```

<1> 事件订阅者的服务同样需要托管于Spring容器

<2> `ApplicationListener<E extends ApplicationEvent>`接口是由Spring提供的事件订阅者必须实现的接口，我们一般把该Service关心的事件类型作为泛型传入。

<3> 处理事件，通过event.getSource()即可拿到事件的具体内容，在本例中便是用户的姓名。

其他两个Service，也同样编写，实际的业务操作仅仅是打印一句内容即可，篇幅限制，这里省略。

### 编写启动类

```java
@SpringBootApplication
@RestController
public class EventDemoApp {

    public static void main(String[] args) {
        SpringApplication.run(EventDemoApp.class, args);
    }

    @Autowired
    UserService userService;

    @RequestMapping("/register")
    public String register(){
        userService.register("kirito");
        return "success";
    }
}
```

当我们调用userService.register("kirito");方法时，控制台打印信息如下：

![用户注册](http://ov0zuistv.bkt.clouddn.com/event1.png)

他们的顺序是无序的，如果需要控制顺序，需要重写order接口，这点不做介绍。其次，我们完成了用户注册和其他服务的解耦，这也是事件驱动的最大特性之一，如果需要在用户注册时完成其他操作，只需要再添加相应的事件订阅者即可。

## Spring 对Event的注解支持

上述的几个接口已经非常清爽了，如果习惯使用注解，Spring也提供了，不再需要显示实现

### 注解式的事件发布者

```java
@Service
public class UserService {

    public void register(String name) {
        System.out.println("用户：" + name + " 已注册！");
        applicationEventPublisher.publishEvent(new UserRegisterEvent(name));
    }

    @Autowired
    private ApplicationEventPublisher applicationEventPublisher;

}
```

Spring4.2之后，ApplicationEventPublisher自动被注入到容器中，采用Autowired即可获取。

### 注解式的事件订阅者

```java
@Service
public class EmailService {

    @EventListener
    public void listenUserRegisterEvent(UserRegisterEvent userRegisterEvent) {
        System.out.println("邮件服务接到通知，给 " + userRegisterEvent.getSource() + " 发送邮件...");
    }
}
```

@EventListener注解完成了`ApplicationListener<E extends ApplicationEvent>`接口的使命。

更多的特性可以参考SpringFramework的文档。

## Spring中事件的应用

在以往阅读Spring源码的经验中，接触了不少使用事件的地方，大概列了以下几个，加深以下印象：

- Spring Security中使用AuthenticationEventPublisher处理用户认证成功，认证失败的消息处理。

  ```java
  public interface AuthenticationEventPublisher {

     void publishAuthenticationSuccess(Authentication authentication);

     void publishAuthenticationFailure(AuthenticationException exception,
           Authentication authentication);
  }
  ```

- Hibernate中持久化对象属性的修改是如何被框架得知的？正是采用了一系列持久化相关的事件，如`DefaultSaveEventListener`，`DefaultUpdateEventListener`,事件非常多，有兴趣可以去`org.hibernate.event`包下查看。

- Spring Cloud Zuul中刷新路由信息使用到的ZuulRefreshListener

  ```java
  private static class ZuulRefreshListener implements ApplicationListener<ApplicationEvent> {
         ...

          public void onApplicationEvent(ApplicationEvent event) {
              if(!(event instanceof ContextRefreshedEvent) && !(event instanceof RefreshScopeRefreshedEvent) && !(event instanceof RoutesRefreshedEvent)) {
                  if(event instanceof HeartbeatEvent && this.heartbeatMonitor.update(((HeartbeatEvent)event).getValue())) {
                      this.zuulHandlerMapping.setDirty(true);
                  }
              } else {
                  this.zuulHandlerMapping.setDirty(true);
              }

          }
      }
  ```

- Spring容器生命周期相关的一些默认Event

  ```
  ContextRefreshedEvent,ContextStartedEvent,ContextStoppedEvent,ContextClosedEvent,RequestHandledEvent
  ```

  。。。其实吧，非常多。。。

## 总结

本文暂时只介绍了Spring中的一些简单的事件驱动机制，相信如果之后再看到Event，Publisher，EventListener一类的单词后缀时，也能立刻和事件机制联系上了。再阅读Spring源码时，如果发现出现了某个Event，但由于不是同步调用，所以很容易被忽视，我一般习惯下意识的去寻找有没有提供默认的Listener，这样不至于漏掉一些“隐藏”的特性。下一篇文章打算聊一聊分布式场景下，事件驱动使用的注意点。



公众号刚刚创立，如果觉得文章不错，希望能分享到您的朋友圈，如果对文章有什么想法和建议，可以与我沟通。

