---
title: Spring Security(四)--详解登录认证流程
date: 2017-09-20 23:25:34
tags:
- Spring Security
categories:
- Spring Security
---

[TOC]

前面的部分，我们关注了Spring Security是如何完成认证工作的，但是另外一部分核心的内容：过滤器，一直没有提到，我们已经知道Spring Security使用了springSecurityFillterChian作为了安全过滤的入口，这一节主要分析一下这个过滤器链都包含了哪些关键的过滤器，并且各自的使命是什么。

## 4 过滤器详解

###4.1 过滤器一览 

由于过滤器链路中的过滤较多，即使是Spring Security的官方文档中也并未对所有的过滤器进行介绍，在之前，《Spring Security(二)--Guides》入门指南中我们配置了一个表单登录的demo，以此为例，来看看这过程中Spring Security都帮我们自动配置了哪些过滤器。

```
Creating filter chain: o.s.s.web.util.matcher.AnyRequestMatcher@1, [o.s.s.web.context.SecurityContextPersistenceFilter@8851ce1, o.s.s.web.header.HeaderWriterFilter@6a472566, o.s.s.web.csrf.CsrfFilter@61cd1c71, o.s.s.web.authentication.logout.LogoutFilter@5e1d03d7, o.s.s.web.authentication.UsernamePasswordAuthenticationFilter@122d6c22, o.s.s.web.savedrequest.RequestCacheAwareFilter@5ef6fd7f, o.s.s.web.servletapi.SecurityContextHolderAwareRequestFilter@4beaf6bd, o.s.s.web.authentication.AnonymousAuthenticationFilter@6edcad64, o.s.s.web.session.SessionManagementFilter@5e65afb6, o.s.s.web.access.ExceptionTranslationFilter@5b9396d3, o.s.s.web.access.intercept.FilterSecurityInterceptor@3c5dbdf8]
```

上述的log信息是我从springboot启动的日志中CV所得，spring security的过滤器日志有一个特点：log打印顺序与实际配置顺序符合，也就意味着`SecurityContextPersistenceFilter`是整个过滤器链的第一个过滤器，而`FilterSecurityInterceptor`则是末置的过滤器。另外通过观察过滤器的名称，和所在的包名，可以大致地分析出他们各自的作用，如`UsernamePasswordAuthenticationFilter`明显便是与使用用户名和密码登录相关的过滤器，而`FilterSecurityInterceptor`我们似乎看不出它的作用，但是其位于`web.access`包下，大致可以分析出他与权限相关。第四篇文章主要就是介绍这些常用的过滤器，对其中关键的过滤器进行一些源码分析。先大致介绍下每个过滤器的作用：

- **SecurityContextPersistenceFilter** 两个主要职责：请求来临时，创建`SecurityContext`安全上下文信息，请求结束时清空`SecurityContextHolder`。
- HeaderWriterFilter (文档中并未介绍，非核心过滤器) 用来给http响应添加一些Header,比如X-Frame-Options, X-XSS-Protection*，X-Content-Type-Options.
- CsrfFilter 在spring4这个版本中被默认开启的一个过滤器，用于防止csrf攻击，了解前后端分离的人一定不会对这个攻击方式感到陌生，前后端使用json交互需要注意的一个问题。
- LogoutFilter 顾名思义，处理注销的过滤器
- **UsernamePasswordAuthenticationFilter** 这个会重点分析，表单提交了username和password，被封装成token进行一系列的认证，便是主要通过这个过滤器完成的，在表单认证的方法中，这是最最关键的过滤器。
- RequestCacheAwareFilter  (文档中并未介绍，非核心过滤器) 内部维护了一个RequestCache，用于缓存request请求
- SecurityContextHolderAwareRequestFilter 此过滤器对ServletRequest进行了一次包装，使得request具有更加丰富的API
- **AnonymousAuthenticationFilter** 匿名身份过滤器，这个过滤器个人认为很重要，需要将它与UsernamePasswordAuthenticationFilter 放在一起比较理解，spring security为了兼容未登录的访问，也走了一套认证流程，只不过是一个匿名的身份。
- SessionManagementFilter 和session相关的过滤器，内部维护了一个SessionAuthenticationStrategy，两者组合使用，常用来防止`session-fixation protection attack`，以及限制同一用户开启多个会话的数量
- **ExceptionTranslationFilter** 直译成异常翻译过滤器，还是比较形象的，这个过滤器本身不处理异常，而是将认证过程中出现的异常交给内部维护的一些类去处理，具体是那些类下面详细介绍
- **FilterSecurityInterceptor** 这个过滤器决定了访问特定路径应该具备的权限，访问的用户的角色，权限是什么？访问的路径需要什么样的角色和权限？这些判断和处理都是由该类进行的。

其中加粗的过滤器可以被认为是Spring Security的核心过滤器，将在下面，一个过滤器对应一个小节来讲解。

### 4.2 SecurityContextPersistenceFilter 

