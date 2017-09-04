---
title: 解析Spring中的ResponseBody和RequestBody
date: 2017-08-30 12:44:21
tags: Spring
categories: Spring
---

spring，restful，前后端分离这些关键词都是大家耳熟能详的关键词了，一般spring常常需要与前端、第三方使用JSON，XML等形式进行交互，你也一定不会对@RequestBody和@ResponseBody这两个注解感到陌生。

## @ResponseBody的使用

由于@ResponseBody和@RequestBody的内部实现是同样的原理（封装请求和封装响应），所以本文以@ResponseBody为主要入手点，理解清楚任何一者，都可以同时掌握另一者。

如果想要从spring获得一个json形式返回值，操作起来是非常容易的。首先定义一个实体类:

```java
public class Book {
    private Integer id;
    private String bookName;
}
```

接着定义一个后端端点：

```java
@RestController
public class BookController {

    @GetMapping(value = "/book/{bookId}")
    public Book getBook(@PathVariable("bookId") Integer bookId) {
        return new Book(bookId, "book" + bookId);
    }

}
```

在RestController中，相当于给所有的xxxMapping端点都添加了@ResponseBody注解，不返回视图，只返回数据。使用http工具访问这个后端端点`localhost:8080/book/2`，便可以得到如下的响应：

```json
{
    "id": 2,
    "bookName": "book2"
}
```

这是一个最简单的返回JSON对象的使用示例了，相信这样的代码很多人在项目中都写过。

## 添加XML解析

如果我们需要将Book对象以XML的形式返回，该如何操作呢？这也很简单，给Book对象添加@XmlRootElement注解，让spring内部能够解析XML对象。

```java
@XmlRootElement
public class Book {
    private Integer id;
    private String bookName;
}
```

在我们未对web层的BookController做任何改动之前，尝试访问`localhost:8080/book/2`时，会发现得到的结果仍然是前面的JSON对象。这也能够理解，因为Book对象如今既可以被解析为XML，也可以被解析为JSON，我们隐隐察觉这背后有一定的解析顺序关系，但不着急，先看看如何让RestController返回XML解析结果。

方法1 http客户端指定接收的返回结果类型

http协议中，可以给请求头添加Accept属性，笔者常用的http客户端是idea自带的Test RESTful Web Service以及chrome的插件Postman。简单的调试，前者基本可以满足我们大多数的需求，而这里为了给大家更直观的体验，笔者使用了Postman。以code形式展示：

```http
GET /book/2 HTTP/1.1
Host: localhost:8080
Accept: application/xml
```

响应内容如下：

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<book>
    <bookName>book2</bookName>
    <id>2</id>
</book>
```

方法2 在RestController后端端点中指定返回类型

修改后的RestController如下所示

```java
@RestController
public class BookController {

    @GetMapping(value = "/book/{bookId}", produces = {"application/xml"})
    public Book getBook(@PathVariable("bookId") Integer bookId) {
        return new Book(bookId, "book" + bookId);
    }

}
```

此时即使将请求中的`Accept: application/xml`去除，依旧可以返回上述的XML结果。

通常情况下，我们的服务端返回的形式一般是固定的，即限定了是JSON，XML中的一种，不建议依赖于客户端添加Accept的信息，而是在服务端限定produces类型。

## 详解Accpect与produces

Accpect包含在http协议的请求头中，其本身代表着客户端发起请求时，期望返回的响应结果的媒体类型。如果服务端可能返回多个媒体类型，则可以通过Accpect指定具体的类型。

produces是Spring为我们提供的注解参数，代表着服务端能够支持返回的媒体类型，我们注意到produces后跟随的是一个数组类型，也就意味着服务端支持多种媒体类型的响应。

在上一节中，我们未显示指定produces值时，其实就隐式的表明，支持XML形式，JSON形式的媒体类型响应。从实验结果，我们也可以看出，当请求未指定Accpect，响应未指定produces时，具体采用何种形式返回是有Spring控制的。在接口交互时，最良好的对接方式，当然是客户端指定Accpect，服务端指定produces，这样可以避免模棱两可的请求响应，避免出现意想不到的对接结果。

## 详解ContentType与consumes

恰恰和Accpect&produces相反，这两个参数是与用于限制请求的。理解了前两者的含义，这两个参数可以举一反三理解清楚。

ContentType包含在http协议的请求头中，其本身代表着客户端发起请求时，告知服务端自己的请求媒体类型是什么。

consumes是Spring为我们提供的注解参数，代表着服务端能够支持处理的请求媒体类型，同样是一个数组，意味着服务端支持多种媒体类型的请求。一般而言，consumes与produces对请求响应媒体类型起到的限制作用，我们给他一个专有名词：窄化。

## http请求响应媒体类型一览

上面描述的4个属性：Accpect与produces，ContentType与consumes究竟有哪些类型与之对应呢？我只将常用的一些列举了出来：

| 媒体类型                               | 含义         |
| ---------------------------------- | ---------- |
| text/html                          | HTML格式     |
| text/plain                         | 纯文本格式      |
| text/xml, application/xml          | XML数据格式    |
| application/json                   | JSON数据格式   |
| image/gif                          | gif图片格式    |
| image/png                          | png图片格式    |
| application/octet-stream           | 二进制流数据     |
| application/ x-www-form-urlencoded | form表单数据   |
| multipart/form-data                | 含文件的form表单 |

其中有几个类型值得一说，web开发中我们常用的提交表单操作，其默认的媒体类型就是application/ x-www-form-urlencoded，而当表单中包含文件时，大家估计都踩过坑，需要将enctype=multipart/form-data设置在form参数中。text/html也就是常见的网页了，json与xml常用于数据交互，其他不再赘述。

而在JAVA中，提供了MediaType这样的抽象，来与http的媒体类型进行对应。‘/’之前的名词，如text，application被称为类型（type），‘/’之后被称为子类型(subType)。

## 详解HttpMessageConverter

我们想要搞懂Spring到底如何完成众多实体类等复杂类型的数据转换以及与媒体类型的对应，就必须要搞懂HttpMessageConverter这个顶级接口：

```java
public interface HttpMessageConverter<T> {
    boolean canRead(Class<?> var1, MediaType var2);

    boolean canWrite(Class<?> var1, MediaType var2);

    List<MediaType> getSupportedMediaTypes();

    T read(Class<? extends T> var1, HttpInputMessage var2) throws IOException, HttpMessageNotReadableException;

    void write(T var1, MediaType var2, HttpOutputMessage var3) throws IOException, HttpMessageNotWritableException;
}
```

大致能看出Spring的处理思路。下面的流程图可以更好方便我们的理解：

![HttpMessageConverter运转流程](/css/images/post/httpMessageConveter.png)

对于添加了@RequestBody和@ResponseBody注解的后端端点，都会经历由HttpMessageConverter进行的数据转换的过程。而在Spring启动之初，就已经有一些默认的转换器被注册了。通过在`RequestResponseBodyMethodProcessor` 中打断点，我们可以获取到一个converters列表：

![内置转换器列表](/css/images/post/converters.png)

源码方面不做过多的解读，有兴趣的朋友可以研究一下`RequestResponseBodyMethodProcessor` 中的handleReturnValue方法，包含了转换的核心实现。

## 自定义HttpMessageConverter

前面已经提及了消息转换器是通过判断媒体类型来调用响应的转换类的，不禁引发了我们的思考，如果我们遇到了不常用的MediaType，或者自定义的MediaType，又想要使用Spring的@RequestBody，@ResponseBody注解，该如何添加代码呢？下面我们通过自定义一个HttpMessageConverter来了解Spring内部的转换过程。

先定义我们的需求，自定一个MediaType：application/toString，当返回一个带有@ResponseBody注解的实体类时，将该实体类的ToString作为响应内容。

1 首先重写Book的ToString方法，方便后期效果展示

```java
@Override
public String toString() {
    return "~~~Book{" +
            "id=" + id +
            ", bookName='" + bookName + '\'' +
            "}~~~";
}
```

2 编写自定义的消息转换器

```java
public class ToStringHttpMessageConverter extends AbstractHttpMessageConverter<Object> {

    public ToStringHttpMessageConverter() {
        super(new MediaType("application", "toString", Charset.forName("UTF-8")));// <1>
    }

    @Override
    protected boolean supports(Class<?> clazz) {
        return true;
    }

    //从请求体封装数据 对应RequestBody 用String接收
    @Override
    protected Object readInternal(Class<?> clazz, HttpInputMessage inputMessage) throws IOException, HttpMessageNotReadableException {
        return StreamUtils.copyToString(inputMessage.getBody(), Charset.forName("UTF-8"));
    }

    //从响应体封装数据 对应ResponseBody
    @Override
    protected void writeInternal(Object o, HttpOutputMessage outputMessage) throws IOException, HttpMessageNotWritableException {
        String result = o.toString();//<2>
        outputMessage.getBody().write(result.getBytes());
    }
}
```

<1> 此处指定了支持的媒体类型

<2> 调用类的ToString方法，将结果写入到输出流中

3 配置自定义的消息转换器

```java
@Configuration
public class WebMvcConfig extends WebMvcConfigurerAdapter{

    @Override
    public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
        converters.add(new ToStringHttpMessageConverter());
    }
}
```

4 配置后端端点，指定生产类型

```java
@RestController
public class BookController {

    @GetMapping(value = "/book/{bookId}",produces = {"application/toString","application/json","application/xml"})
    public Book getBook(@PathVariable("bookId") Integer bookId) {
        return new Book(bookId, "book" + bookId);
    }
}
```

此处只是为了演示，添加了三个生产类型，我们的后端端点可以支持输出三种类型，而具体输出哪一者，则依赖客户端的Accept指定。

5 客户端请求

```http
GET /book/2 HTTP/1.1
Host: localhost:8080
Accept: application/toString
```

响应结果如下：

```
​~~~Book{id=2, bookName='book2'}~~~
```

此时，你可以任意指定Accept的类型，即可获得不同形式的Book返回结果，可以是application/toString，application/json，application/xml，都会对应各自的HttpMessageConverter。

