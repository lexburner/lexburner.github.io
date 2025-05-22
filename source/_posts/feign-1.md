---
title: 从 Feign 使用注意点到 RESTFUL 接口设计规范
date: 2017-09-09 14:43:28
tags: Spring Cloud
categories: Spring Cloud
toc: true
---

最近项目中大量使用了 Spring Cloud Feign 来对接 http 接口，踩了不少坑，也产生了一些对 RESTFUL 接口设计的想法，特此一篇记录下。

[TOC]

## SpringMVC 的请求参数绑定机制

了解 Feign 历史的朋友会知道，Feign 本身是 Netflix 的产品，Spring Cloud Feign 是在原生 Feign 的基础上进行了封装，引入了大量的 SpringMVC 注解支持，这一方面使得其更容易被广大的 Spring 使用者开箱即用，但也产生了不小的混淆作用。所以在使用 Spring Cloud Feign 之前，笔者先介绍一下 SpringMVC 的一个入参机制。预设一个 RestController，在本地的 8080 端口启动一个应用，用于接收 http 请求。

<!-- more -->

```java
@RestController
public class BookController {

<!-- more -->

    @RequestMapping(value = "/hello") // <1>
    public String hello(String name) { // <2>
        return "hello" + name;
    }

}
```

这个接口写起来非常简单，但实际 springmvc 做了非常多的兼容，使得这个接口可以接受多种请求方式。

<1> RequestMapping 代表映射的路径，使用 GET,POST,PUT,DELETE 方式都可以映射到该端点。

<2> SpringMVC 中常用的请求参数注解有（@RequestParam,@RequestBody,@PathVariable）等。name 被默认当做 @RequestParam。形参 `String name` 由框架使用字节码技术获取 name 这个名称，自动检测请求参数中 key 值为 name 的参数，也可以使用 @RequestParam("name") 覆盖变量本身的名称。当我们在 url 中携带 name 参数或者 form 表单中携带 name 参数时，会被获取到。

```http
POST /hello HTTP/1.1
Host: localhost:8080
Content-Type: application/x-www-form-urlencoded

name=formParam
```

或

```http
GET /hello?name=queryString HTTP/1.1
Host: localhost:8080
```

## Feign 的请求参数绑定机制

上述的 SpringMVC 参数绑定机制，大家应该都是非常熟悉的，但这一切在 Feign 中有些许的不同。

我们来看一个非常简单的，但是实际上错误的接口写法：

```java
// 注意：错误的接口写法
@FeignClient("book")
public interface BookApi {

    @RequestMapping(value = "/hello",method = RequestMethod.GET)
    String hello(String name);

}
```

配置请求地址：

```yaml
ribbon:
  eureka:
   enabled: false

book:
  ribbon:
    listOfServers: http://localhost:8080
```

我们按照写 SpringMVC 的 RestController 的习惯写了一个 FeignClient，按照我们的一开始的想法，由于指定了请求方式是 GET，那么 name 应该会作为 QueryString 拼接到 Url 中吧？发出一个这样的 GET 请求：

```http
GET /hello?name=xxx HTTP/1.1
Host: localhost:8080
```

而实际上，RestController 并没有接收到，我们在 RestController 一侧的应用中获得了一些提示：

![服务端 DEBUG 信息](https://image.cnkirito.cn/feignlog.png)

- 并没有按照期望使用 GET 方式发送请求，而是 POST 方式
- name 参数没有被封装，获得了一个 null 值

查看文档发现，如果不加默认的注解，Feign 则会对参数默认加上 @RequestBody 注解，而 RequestBody 一定是包含在请求体中的，GET 方式无法包含。所以上述两个现象得到了解释。Feign 在 GET 请求包含 RequestBody 时强制转成了 POST 请求，而不是报错。

理解清楚了这个机制我们就可以在开发 Feign 接口避免很多坑。而解决上述这个问题也很简单

- 在 Feign 接口中为 name 添加 @RequestParam("name") 注解，name 必须指定，Feign 的请求参数不会利用 SpringMVC 字节码的机制自动给定一个默认的名称。
- 由于 Feign 默认使用 @RequestBody，也可以改造 RestController，使用 @RequestBody 接收。但是，请求参数通常是多个，推荐使用上述的 @RequestParam，而 @RequestBody 一般只用于传递对象。

## Feign 绑定复合参数

指定请求参数的类型与请求方式，上述问题的出现实际上是由于在没有理清楚 Feign 内部机制的前提下想当然的和 SpringMVC 进行了类比。同样，在使用对象作为参数时，也需要注意这样的问题。

对于这样的接口

```java
@FeignClient("book")
public interface BookApi {

    @RequestMapping(value = "/book",method = RequestMethod.POST)
    Book book(@RequestBody Book book); // <1>
  
    @RequestMapping(value = "/book",method = RequestMethod.POST)
    Book book(@RequestParam("id") String id,@RequestParam("name") String name); // <2>
  
    @RequestMapping(value = "/book",method = RequestMethod.POST)
    Book book(@RequestParam Map map); // <3>
  
    // 错误的写法
  	@RequestMapping(value = "/book",method = RequestMethod.POST)
    Book book(@RequestParam Book book); // <4>

}
```

<1> 使用 @RequestBody 传递对象是最常用的方式。

<2> 如果参数并不是很多，可以平铺开使用 @RequestParam

<3> 使用 Map，这也是完全可以的，但不太符合面向对象的思想，不能从代码立刻看出该接口需要什么样的参数。

<4> 错误的用法，Feign 没有提供这样的机制自动转换实体为 Map。

## Feign 中使用 @PathVariable 与 RESTFUL 规范

这涉及到一个如何设计 RESTFUL 接口的话题，我们知道在自从 RESTFUL 在 2000 年初被提出来之后，就不乏文章提到资源，契约规范，CRUD 对应增删改查操作等等。下面笔者从两个实际的接口来聊聊自己的看法。

根据 id 查找用户接口：

```java
@FeignClient("user")
public interface UserApi {

    @RequestMapping(value = "/user/{userId}",method = RequestMethod.GET)
    String findById(@PathVariable("id") String userId);

}
```

这应该是没有争议的，注意前面强调的，@PathVariable("id") 括号中的 id 不可以忘记。那如果是“根据邮箱查找用户呢”? 很有可能下意识的写出这样的接口：

```java
@FeignClient("user")
public interface UserApi {
  
    @RequestMapping(value = "/user/{email}",method = RequestMethod.GET)
    String findByEmail(@PathVariable("email") String email);

}
```

- 首先看看 Feign 的问题。email 中通常包含’.‘这个特殊字符，如果在路径中包含，会出现意想不到的结果。我不想探讨如何去解决它（实际上可以使用 {email:.+} 的方式), 因为我觉得这不符合设计。
- 再谈谈规范的问题。这两个接口是否是相似的，email 是否应该被放到 path 中？这就要聊到 RESTFUL 的初衷，为什么 userId 这个属性被普遍认为适合出现在 RESTFUL 路径中，因为 id 本身起到了资源定位的作用，他是资源的标记。而 email 不同，它可能是唯一的，但更多的，它是资源的属性，所以，笔者认为不应该在路径中出现非定位性的动态参数。而是把 email 作为 @RequestParam 参数。

## RESUFTL 结构化查询

笔者成功的从 Feign 的话题过度到了 RESTFUL 接口的设计问题，也导致了本文的篇幅变长了，不过也不打算再开一片文章谈了。

再考虑一个接口设计，查询某一个月某个用户的订单，可能还会携带分页参数，这时候参数变得很多，按照传统的设计，这应该是一个查询操作，也就是与 GET 请求对应，那是不是意味着应当将这些参数拼接到 url 后呢？再思考 Feign，正如本文的第二段所述，是不支持 GET 请求携带实体类的，这让我们设计陷入了两难的境地。而实际上参考一些 DSL 语言的设计如 elasticSearch，也是使用 POST JSON 的方式来进行查询的，所以在实际项目中，笔者并不是特别青睐 CRUD 与四种请求方式对应的这种所谓的 RESTFUL 规范，如果说设计 RESTFUL 应该遵循什么规范，那大概是另一些名词，如契约规范和领域驱动设计。

```java
@FeignClient("order")
public interface BookApi {

    @RequestMapping(value = "/order/history",method = RequestMethod.POST)
    Page<List<Orders>> queryOrderHistory(@RequestBody QueryVO queryVO);

}
```

## RESTFUL 行为限定

在实际接口设计中，我遇到了这样的需求，用户模块的接口需要支持修改用户密码，修改用户邮箱，修改用户姓名，而笔者之前阅读过一篇文章，也是讲舍弃 CRUD 而是用领域驱动设计来规范 RESTFUL 接口的定义，与项目中我的想法不谋而合。看似这三个属性是同一个实体类的三个属性，完全可以如下设计：

```
@FeignClient("user")
public interface UserApi {

    @RequestMapping(value = "/user",method = RequestMethod.POST)
    User update(@RequestBody User user);

}
```

但实际上，如果再考虑多一层，就应该产生这样的思考：这三个功能所需要的权限一致吗？真的应该将他们放到一个接口中吗？实际上，笔者并不希望接口调用方传递一个实体，因为这样的行为是不可控的，完全不知道它到底是修改了什么属性，如果真的要限制行为，还需要在 User 中添加一个操作类型的字段，然后在接口实现方加以校验，这太麻烦了。而实际上，笔者觉得规范的设计应当如下：

```java
@FeignClient("user")
public interface UserApi {

    @RequestMapping(value = "/user/{userId}/password/update",method = RequestMethod.POST)
    ResultBean<Boolean> updatePassword(@PathVariable("userId) String userId,@RequestParam("password") password);
    
    @RequestMapping(value = "/user/{userId}/email/update",method = RequestMethod.POST)
    ResultBean<Boolean> updateEmail(@PathVariable("userId) String userId,@RequestParam("email") String email);
    
    @RequestMapping(value = "/user/{userId}/username/update",method = RequestMethod.POST)
    ResultBean<Boolean> updateUsername(@PathVariable("userId) String userId,@RequestParam("username") String username);

}
```

- 一般意义上 RESTFUL 接口不应该出现动词，这里的 update 并不是一个动作，而是标记着操作的类型，因为针对某个属性可能出现的操作类型可能会有很多，所以我习惯加上一个 update 后缀，明确表达想要进行的操作，而不是仅仅依赖于 GET，POST，PUT，DELETE。实际上，修改操作推荐使用的请求方式应当是 PUT，这点笔者的理解是，已经使用 update 标记了行为，实际开发中不习惯使用 PUT。
- password，email，username 都是 user 的属性，而 userId 是 user 的识别符号，所以 userId 以 PathVariable 的形式出现在 url 中，而三个属性出现在 ReqeustParam 中。

顺带谈谈逻辑删除，如果一个需求是删除用户的常用地址，这个 api 的操作类型，我通常也不会设计为 DELETE 请求，而是同样使用 delete 来标记操作行为

```java
@RequestMapping(value = "/user/{userId}/address/{addressId}/delete",method = RequestMethod.POST)
    ResultBean<Boolean> updateEmail(@PathVariable("userId") String userId,@PathVariable("userId") String email);
```

## 总结

本文从 Feign 的使用注意点，聊到了 RESTFUL 接口的设计问题，其实是一个互相补充的行为。接口设计需要载体，所以我以 Feign 的接口风格谈了谈自己对 RESTFUL 设计的理解，而 Feign 中一些坑点，也正是我想要规范 RESTFUL 设计的出发点。如有对 RESTFUL 设计不同的理解，欢迎与我沟通。



























