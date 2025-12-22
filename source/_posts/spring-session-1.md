---
title: Re：从零开始的 Spring Session(一)
date: 2017-09-03 15:27:04
tags: 
- Spring Session
- Spring
categories:
- Spring
toc: true
---

Session 和 Cookie 这两个概念，在学习 java web 开发之初，大多数人就已经接触过了。最近在研究跨域单点登录的实现时，发现对于 Session 和 Cookie 的了解，并不是很深入，所以打算写两篇文章记录一下自己的理解。在我们的应用集成 Spring Session 之前，先补充一点 Session 和 Cookie 的关键知识。

## Session 与 Cookie 基础

由于 http 协议是无状态的协议，为了能够记住请求的状态，于是引入了 Session 和 Cookie 的机制。我们应该有一个很明确的概念，那就是 Session 是存在于服务器端的，在单体式应用中，他是由 tomcat 管理的，存在于 tomcat 的内存中，当我们为了解决分布式场景中的 session 共享问题时，引入了 redis，其共享内存，以及支持 key 自动过期的特性，非常契合 session 的特性，我们在企业开发中最常用的也就是这种模式。但是只要你愿意，也可以选择存储在 JDBC，Mongo 中，这些，spring 都提供了默认的实现，在大多数情况下，我们只需要引入配置即可。而 Cookie 则是存在于客户端，更方便理解的说法，可以说存在于浏览器。Cookie 并不常用，至少在我不长的 web 开发生涯中，并没有什么场景需要我过多的关注 Cookie。http 协议允许从服务器返回 Response 时携带一些 Cookie，并且同一个域下对 Cookie 的数量有所限制，之前说过 Session 的持久化依赖于服务端的策略，而 Cookie 的持久化则是依赖于本地文件。虽然说 Cookie 并不常用，但是有一类特殊的 Cookie 却是我们需要额外关注的，那便是与 Session 相关的 sessionId，他是真正维系客户端和服务端的桥梁。

<!-- more -->

## 代码示例

用户发起请求，服务器响应请求，并做一些用户信息的处理，随后返回响应给用户；用户再次发起请求，携带 sessionId，服务器便能够识别，这个用户就是之前请求的那个。

使用 Springboot 编写一个非常简单的服务端，来加深对其的理解。需求很简单，当浏览器访问 `localhost:8080/test/cookie?browser=xxx` 时，如果没有获取到 session，则将 request 中的 browser 存入 session；如果获取到 session，便将 session 中的 browser 值输出。顺便将 request 中的所有 cookie 打印出来。

```java
@Controller
public class CookieController {

    @RequestMapping("/test/cookie")
    public String cookie(@RequestParam("browser") String browser, HttpServletRequest request, HttpSession session) {
        // 取出 session 中的 browser
        Object sessionBrowser = session.getAttribute("browser");
        if (sessionBrowser == null) {
            System.out.println("不存在 session，设置 browser=" + browser);
            session.setAttribute("browser", browser);
        } else {
            System.out.println("存在 session，browser=" + sessionBrowser.toString());
        }
        Cookie[] cookies = request.getCookies();
        if (cookies != null && cookies.length > 0) {
            for (Cookie cookie : cookies) {
                System.out.println(cookie.getName() + ":" + cookie.getValue());
            }
        }
        return "index";
    }
}
```

我们没有引入其他任何依赖，看看原生的 session 机制是什么。

1 使用 chrome 浏览器，访问 `localhost:8080/test/cookie?browser=chrome`, 控制台输出如下：

```
Session Info:	不存在 session，设置 browser=chrome
```

既没有 session，也没有 cookie，我们将 browser=chrome 设置到 session 中。

再次访问同样的端点，控制台输出如下：

```
Session Info:	存在 session，browser=chrome
Cookie Info:	JSESSIONID : 4CD1D96E04FC390EA6C60E8C40A636AF
```

多次访问之后，控制台依旧打印出同样的信息。

稍微解读下这个现象，可以验证一些结论。当服务端往 session 中保存一些数据时，Response 中自动添加了一个 Cookie：JSESSIONID：xxxx, 再后续的请求中，浏览器也是自动的带上了这个 Cookie，服务端根据 Cookie 中的 JSESSIONID 取到了对应的 session。这验证了一开始的说法，客户端服务端是通过 JSESSIONID 进行交互的，并且，添加和携带 key 为 JSESSIONID 的 Cookie 都是 tomcat 和浏览器自动帮助我们完成的，这很关键。

2 使用 360 浏览器，访问 `localhost:8080/test/cookie?browser=360`

第一次访问：

```
Session Info:	不存在 session，设置 browser=360
```

后续访问：

```
Session Info:	存在 session，browser=360
Cookie Info:	JSESSIONID : 320C21A645A160C4843D076204DA2F40
```

为什么要再次使用另一个浏览器访问呢？先卖个关子，我们最起码可以得出结论，不同浏览器，访问是隔离的，甚至重新打开同一个浏览器，JSESSIONID 也是不同的。另外可以尝试把保存 session 的操作注视掉，则可以发现 Response 中就不会返回 JSESSIONID 了，即这是一次无状态的请求。

## 安全问题

其实上述的知识点，都是非常浅显的，之所以啰嗦一句，是为了引出这一节的内容，以及方便观察后续我们引入 Spring Session 之后的发生的变化。

还记得上一节的代码示例中，我们使用了两个浏览器：

- chrome 浏览器访问时，JSESSIONID 为 4CD1D96E04FC390EA6C60E8C40A636AF，后端 session 记录的值为：browser=chrome。
- 360 浏览器访问时，JSESSIONID 为 320C21A645A160C4843D076204DA2F40, 后端 session 记录的值为：browser=360。

我们使用 chrome 插件 Edit this Cookie，将 chrome 浏览器中的 JSESSIONID 修改为 360 浏览器中的值

![EditThisCookie](https://image.cnkirito.cn/image/EditThisCookie.png)

同样访问原来的端点：localhost:8080/test/cookie?browser=chrome，得到的输出如下：

```
存在 session，browser=360
JSESSIONID : 320C21A645A160C4843D076204DA2F40
```

证实了一点，存放在客户端的 Cookie 的确是存在安全问题的，我们使用 360 的 JSESSIONID“骗”过了服务器。毕竟，服务器只能通过 Cookie 中的 JSESSIONID 来辨别身份。（这提示我们不要在公共场合保存 Cookie 信息，现在的浏览器在保存 Cookie 时通常会让你确定一次）

下一篇文章，将正式讲解如何在应用中集成 Spring Session。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
