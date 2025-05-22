---
title: 设计 RPC 接口时，你有考虑过这些吗？
date: 2018-5-16 22:44:34
tags:
- RPC
categories:
- RPC
toc: true
---

RPC 框架的讨论一直是各个技术交流群中的热点话题，阿里的 dubbo，新浪微博的 motan，谷歌的 grpc，以及不久前蚂蚁金服开源的 sofa，都是比较出名的 RPC 框架。RPC 框架，或者一部分人习惯称之为服务治理框架，更多的讨论是存在于其技术架构，比如 RPC 的实现原理，RPC 各个分层的意义，具体 RPC 框架的源码分析…但却并没有太多话题和“如何设计 RPC 接口”这样的业务架构相关。
<!-- more -->
![段子](https://image.cnkirito.cn/image-20180627182932069.png)

可能很多小公司程序员还是比较关心这个问题的，这篇文章主要分享下一些个人眼中 RPC 接口设计的最佳实践。

### 初识 RPC 接口设计

由于 RPC 中的术语每个程序员的理解可能不同，所以文章开始，先统一下 RPC 术语，方便后续阐述。

大家都知道共享接口是 RPC 最典型的一个特点，每个服务对外暴露自己的接口，该模块一般称之为 api；外部模块想要实现对该模块的远程调用，则需要依赖其 api；每个服务都需要有一个应用来负责实现自己的 api，一般体现为一个独立的进程，该模块一般称之为 app。

api 和 app 是构建微服务项目的最简单组成部分，如果使用 maven 的多 module 组织代码，则体现为如下的形式。

serviceA 服务

serviceA/pom.xml 定义父 pom 文件

```xml
<modules>
    <module>serviceA-api</module>
    <module>serviceA-app</module>
</modules>

<packaging>pom</packaging>
<groupId>moe.cnkirito</groupId>
<artifactId>serviceA</artifactId>
<version>1.0.0-SNAPSHOT</version>
```

serviceA/serviceA-api/pom.xml 定义对外暴露的接口，最终会被打成 jar 包供外部服务依赖

```Xml
<parent>
    <artifactId>serviceA</artifactId>
    <groupId>moe.cnkirito</groupId>
    <version>1.0.0-SNAPSHOT</version>
</parent>

<packaging>jar</packaging>
<artifactId>serviceA-api</artifactId>
```

serviceA/serviceA-app/pom.xml 定义了服务的实现，一般是 springboot 应用，所以下面的配置文件中，我配置了 springboot 应用打包的插件，最终会被打成 jar 包，作为独立的进程运行。

```xml
<parent>
    <artifactId>serviceA</artifactId>
    <groupId>moe.cnkirito</groupId>
    <version>1.0.0-SNAPSHOT</version>
</parent>

<packaging>jar</packaging>
<artifactId>serviceA-app</artifactId>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

麻雀虽小，五脏俱全，这样一个微服务模块就实现了。

### 旧 RPC 接口的痛点

统一好术语，这一节来描述下我曾经遭遇过的 RPC 接口设计的痛点，相信不少人有过相同的遭遇。

- ** 查询接口过多。** 各种 findBy 方法，加上各自的重载，几乎占据了一个接口 80% 的代码量。这也符合一般人的开发习惯，因为页面需要各式各样的数据格式，加上查询条件差异很大，便造成了：一个查询条件，一个方法的尴尬场景。这样会导致另外一个问题，需要使用某个查询方法时，直接新增了方法，但实际上可能这个方法已经出现过了，隐藏在了令人眼花缭乱的方法中。
- ** 难以扩展 **。接口的任何改动，比如新增一个入参，都会导致调用者被迫升级，这也通常是 RPC 设计被诟病的一点，不合理的 RPC 接口设计会放大这个缺点。
- ** 升级困难。** 在之前的 “初识 RPC 接口设计”一节中，版本管理的粒度是 project，而不是 module，这意味着：api 即使没有发生变化，app 版本演进，也会造成 api 的被迫升级，因为 project 是一个整体。问题又和上一条一样了，api 一旦发生变化，调用者也得被迫升级，牵一发而动全身。
- ** 难以测试 **。接口一多，职责随之变得繁杂，业务场景各异，测试用例难以维护。特别是对于那些有良好习惯编写单元测试的程序员而言，简直是噩梦，用例也得跟着改。
- ** 异常设计不合理 **。在既往的工作经历中曾经有一次会议，就 RPC 调用中的异常设计引发了争议，一派人觉得需要有一个业务 CommonResponse，封装异常，每次调用后，优先判断调用结果是否 success，在进行业务逻辑处理；另一派人觉得这比较麻烦，由于 RPC 框架是可以封装异常调用的，所以应当直接 try catch 异常，不需要进行业务包裹。在没有明确规范时，这两种风格的代码同时存在于项目中，十分难看！

在千米网的三个月中，看了不少最佳实践。加上一次公司内部易永健老师的分享，涉及到了相同的话题，耳濡目染，这些曾经我发觉的痛点也逐渐有了解决之道。

###  1 单参数接口

如果你使用过 springcloud ，可能会不适应 http 通信的限制，因为 @RequestBody 只能使用单一的参数，也就意味着，springcloud 构建的微服务架构下，接口天然是单参数的。而 RPC 方法入参的个数在语法层面是不会受到限制的，但如果强制要求入参为单参数，会解决一部分的痛点。

**1.1 使用 Specification 模式解决查询接口过多的问题 **

```Java
public interface StudentApi{
    Student findByName(String name);
    List<Student> findAllByName(String name);
    Student findByNameAndNo(String name,String no);
    Student findByIdcard(String Idcard);
}
```

如上的多个查询方法目的都是同一个：根据条件查询出 Student，只不过查询条件有所差异。试想一下，Student 对象假设有 10 个属性，最坏的情况下它们的排列组合都可能作为查询条件，这便是查询接口过多的根源。

```Java
public interface StudentApi{
    Student findBySpec(StudentSpec spec);
    List<Student> findListBySpec(StudentListSpec spec);
    Page<Student> findPageBySpec(StudentPageSpec spec);
}
```

上述接口便是最通用的单参接口，三个方法几乎囊括了 99% 的查询条件。所有的查询条件都被封装在了 StudentSpec,StudentListSpec,StudentPageSpec 之中，分别满足了单对象查询，批量查询，分页查询的需求。如果你了解领域驱动设计，会发现这里借鉴了其中 Specification 模式的思想。

**1.2 单参数易于做统一管理 **

```Java
public interface SomeProvider {
    void opA(ARequest request);
    void opB(BRequest request);
    CommonResponse<C> opC(CRequest request);
}
```

入参中的入参虽然形态各异，但由于是单个入参，所以可以统一继承 AbstractBaseRequest，即上述的 ARequest，BRequest，CRequest 都是 AbstractBaseRequest 的子类。在千米内部项目中，AbstractBaseRequest 定义了 traceId、clientIp、clientType、operationType 等公共入参，减少了重复命名，我们一致认为，这更加的 OO。

有了 AbstractBaseRequest，我们可以更加轻松地在其之上做 AOP，千米的实践中，大概做了如下的操作：

- 请求入参统一校验（request.checkParam(); param.checkParam();）
- 实体变更统一加锁，降低锁粒度
- 请求分类统一处理（if (request instanceof XxxRequest)）
- 请求报文统一记日志（log.setRequest(JsonUtil.getJsonString(request)))
- 操作成功统一发消息

如果不遵守单参数的约定，上述这些功能也并不是无法实现，但所需花费的精力远大于单参数，一个简单的约定带来的优势，我们认为是值得的。

**1.3 单参数入参兼容性强 **

还记得前面的小节中，我提到了 SpringCloud，在 SpringCloud Feign 中，接口的入参通常会被 @RequestBody 修饰，强制做单参数的限制。千米内部使用了 Dubbo 作为 Rpc 框架，一般而言，为 Dubbo 服务设计的接口是不能直接用作 Feign 接口的（主要是因为 @RequestBody 的限制），但有了单参数的限制，便使之成为了可能。为什么我好端端的 Dubbo 接口需要兼容 Feign 接口？可能会有人发出这样的疑问，莫急，这样做的初衷当然不是为了单纯做接口兼容，而是想充分利用 HTTP 丰富的技术栈以及一些自动化工具。

- 自动生成 HTTP 接口实现（让服务端同时支持 Dubbo 和 HTTP 两种服务接口）

看过我之前文章的朋友应该了解过一个设计：千米内部支持的是 Dubbo 协议和 HTTP 协议族（如 JSON RPC 协议，Restful 协议），这并不意味着程序员需要写两份代码，我们可以通过 Dubbo 接口自动生成 HTTP 接口，体现了单参数设计的兼容性之强。

- 通过 Swagger UI 实现对 Dubbo 接口的可视化便捷测试

又是一个兼容 HTTP 技术栈带来的便利，在 Restful 接口的测试中，Swagger 一直是备受青睐的一个工具，但可惜的是其无法对 Dubbo 接口进行测试。兼容 HTTP 后，我们只需要做一些微小的工作，便可以实现 Swagger 对 Dubbo 接口的可视化测试。

- 有利于 TestNg 集成测试

自动生成 TestNG 集成测试代码和缺省测试用例，这使得服务端接口集成测试变得异常简单，程序员更能集中精力设计业务用例，结合缺省用例、JPA 自动建表和 PowerMock 模拟外部依赖接口实现本机环境。

![TestNg 自动化测试](https://image.cnkirito.cn/image-20180628103929293.png)

这块涉及到了公司内部的代码，只做下简单介绍，我们一般通过内部项目 com.qianmi.codegenerator:api-dubbo-2-restful ，com.qianmi.codegenerator:api-request-json 生成自动化的测试用例，方便测试。而这些自动化工具中大量使用了反射，而由于单参数的设计，反射用起来比较方便。

### 2. 接口异常设计

首先肯定一点，RPC 框架是可以封装异常的，Exception 也是返回值的一部分。在 go 语言中可能更习惯于返回 err,res 的组合，但 JAVA 中我个人更偏向于 try catch 的方法捕获异常。RPC 接口设计中的异常设计也是一个注意点。

** 初始方案 **

```java
public interface ModuleAProvider {
    void opA(ARequest request);
    void opB(BRequest request);
    CommonResponse<C> opC(CRequest request);
}
```

我们假设模块 A 存在上述的 ModuleAProvider 接口，ModuleAProvider 的实现中或多或少都会出现异常，例如可能存在的异常 ModuleAException，调用者实际上并不知道 ModuleAException 的存在，只有当出现异常时，才会知晓。对于 ModuleAException 这种业务异常，我们更希望调用方能够显示的处理，所以 ModuleAException 应该被设计成 Checked Excepition。

** 正确的异常设计姿势 **

```java
public interface ModuleAProvider {
    void opA(ARequest request) throws ModuleAException;
    void opB(BRequest request) throws ModuleAException;
    CommonResponse<C> opC(CRequest request) throws ModuleAException;
}
```

上述接口中定义的异常实际上也是一种契约，契约的好处便是不需要叙述，调用方自然会想到要去处理 Checked Exception，否则连编译都过不了。

** 调用方的处理方式 **

在 ModuleB 中，应当如下处理异常：

```java
public class ModuleBService implements ModuleBProvider {
    @Reference
    ModuleAProvider moduleAProvider;
    
    @Override
    public void someOp() throws ModuleBexception{
        try{
            moduleAProvider.opA(...);
        }catch(ModuleAException e){
            throw new ModuleBException(e.getMessage());
        }
    }
    
    @Override
    public void anotherOp(){
        try{
            moduleAProvider.opB(...);
        }catch(ModuleAException e){
            // 业务逻辑处理
        }
    }
}
```

someOp 演示了一个异常流的传递，ModuleB 暴露出去的异常应当是 ModuleB 的 api 模块中异常类，虽然其依赖了 ModuleA ，但需要将异常进行转换，或者对于那些意料之中的业务异常可以像 anotherOp() 一样进行处理，不再传递。这时如果新增 ModuleC 依赖 ModuleB，那么 ModuleC 完全不需要关心 ModuleA 的异常。

** 异常与熔断 **

作为系统设计者，我们应该认识到一点： RPC 调用，失败是常态。通常我们需要对 RPC 接口做熔断处理，比如千米内部便集成了 Netflix 提供的熔断组件 Hystrix。Hystrix 需要知道什么样的异常需要进行熔断，什么样的异常不能够进行熔断。在没有上述的异常设计之前，回答这个问题可能还有些难度，但有了 Checked Exception 的契约，一切都变得明了清晰了。

```Java
public class ModuleAProviderProxy {

    @Reference
    private ModuleAProvider moduleAProvider;

    @HystrixCommand(ignoreExceptions = {ModuleAException.class})
    public void opA(ARequest request) throws ModuleAException {
        moduleAProvider.opA(request);
    }

    @HystrixCommand(ignoreExceptions = {ModuleAException.class})
    public void opB(BRequest request) throws ModuleAException {
        moduleAProvider.oBB(request);
    }
    
    @HystrixCommand(ignoreExceptions = {ModuleAException.class})
    public CommonResponse<C> opC(CRequest request) throws ModuleAException {
        return moduleAProvider.opC(request);
    }
  
}
```

如服务不可用等原因引发的多次接口调用超时异常，会触发 Hystrix 的熔断；而对于业务异常，我们则认为不需要进行熔断，因为对于接口 throws 出的业务异常，我们也认为是正常响应的一部分，只不过借助于 JAVA 的异常机制来表达。实际上，和生成自动化测试类的工具一样，我们使用了另一套自动化的工具，可以由 Dubbo 接口自动生成对应的 Hystrix Proxy。我们坚定的认为开发体验和用户体验一样重要，所以公司内部会有非常多的自动化工具。

### 3. API 版本单独演进

引用一段公司内部的真实对话：

> A：我下载了你们的代码库怎么编译不通过啊，依赖中 xxx-api-1.1.3 版本的 jar 包找不到了，那可都是 RELEASE 版本啊。
>
> B：你不知道我们 nexus 容量有限，只能保存最新的 20 个 RELEASE 版本吗？那个 API 现在最新的版本是 1.1.31 啦。
>
> A：啊，这才几个月就几十个 RELEASE 版本啦？这接口太不稳定啦。
>
> B： 其实接口一行代码没改，我们业务分析是很牛逼的，一直很稳定。但是这个 API 是和我们项目一起打包的，我们需求更新一次，就发布一次，API 就被迫一起升级版本。发生这种事，大家都不想的。

在单体式架构中，版本演进的单位是整个项目。微服务解决的一个关键的痛点便是其做到了每个服务的单独演进，这大大降低了服务间的耦合。正如我文章开始时举得那个例子一样：serviceA 是一个演进的单位，serviceA-api 和 serviceA-app 这两个 Module 从属于 serviceA，这意味着 app 的一次升级，将会引发 api 的升级，因为他们是共生的！而从微服务的使用角度来看，调用者关心的是 api 的结构，而对其实现压根不在乎。所以对于 api 定义未发生变化，其 app 发生变化的那些升级，其实可以做到对调用者无感知。在实践中也是如此

​			**api 版本的演进应该是缓慢的，而 app 版本的演进应该是频繁的。**

所以，对于这两个演进速度不一致的模块，我们应该单独做版本管理，他们有自己的版本号。

### 4. 问题回归

- ** 查询接口过多。** 各种 findBy 方法，加上各自的重载，几乎占据了一个接口 80% 的代码量。这也符合一般人的开发习惯，因为页面需要各式各样的数据格式，加上查询条件差异很大，便造成了：一个查询条件，一个方法的尴尬场景。这样会导致另外一个问题，需要使用某个查询方法时，直接新增了方法，但实际上可能这个方法已经出现过了，隐藏在了令人眼花缭乱的方法中。

解决方案：使用单参 +Specification 模式，降低重复的查询方法，大大降低接口中的方法数量。

- ** 难以扩展 **。接口的任何改动，比如新增一个入参，都会导致调用者被迫升级，这也通常是 RPC 设计被诟病的一点，不合理的 RPC 接口设计会放大这个缺点。

解决方案：单参设计其实无形中包含了所有的查询条件的排列组合，可以直接在 app 实现逻辑的新增，而不需要对 api 进行改动（如果是参数的新增则必须进行 api 的升级，参数的废弃可以用 @Deprecated 标准）。

- ** 升级困难。** 在之前的 “初识 RPC 接口设计”一节中，版本管理的粒度是 project，而不是 module，这意味着：api 即使没有发生变化，app 版本演进，也会造成 api 的被迫升级，因为 project 是一个整体。问题又和上一条一样了，api 一旦发生变化，调用者也得被迫升级，牵一发而动全身。

解决方案：以 module 为版本演进的粒度。api 和 app 单独演进，减少调用者的不必要升级次数。

- ** 难以测试 **。接口一多，职责随之变得繁杂，业务场景各异，测试用例难以维护。特别是对于那些有良好习惯编写单元测试的程序员而言，简直是噩梦，用例也得跟着改。

解决方案：单参数设计 + 自动化测试工具，打造良好的开发体验。

- ** 异常设计不合理 **。在既往的工作经历中曾经有一次会议，就 RPC 调用中的异常设计引发了争议，一派人觉得需要有一个业务 CommonResponse，封装异常，每次调用后，优先判断调用结果是否 success，在进行业务逻辑处理；另一派人觉得这比较麻烦，由于 RPC 框架是可以封装异常调用的，所以应当直接 try catch 异常，不需要进行业务包裹。在没有明确规范时，这两种风格的代码同时存在于项目中，十分难看！

解决方案：Checked Exception+ 正确异常处理姿势，使得代码更加优雅，降低了调用方不处理异常带来的风险。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
