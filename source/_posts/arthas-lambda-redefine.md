---
title: lambda 表达式导致 Arthas 无法 redefine 的问题
date: 2020-08-26 21:04:52
tags:
- Arthas
categories:
- Arthas
type: 2
toc: true
---

> 原文出处：https://m.jb51.net/article/188155.htm
>
> 作者：鲁严波

这篇文章主要介绍了 lambda 表达式导致 Arthas 无法 redefine 的问题,本文通过图文实例相结合给大家介绍的非常详细，对大家的学习或工作具有一定的参考借鉴价值，需要的朋友可以参考下。

通过 arthas 的 redefine 命令，可以做到不用重新发布，就可以改变程序行为。

但是用多了，发现很多时候，我们就改了几行代码，甚至有的时候就添加了一行日志，就无法 redefine 了。提示：

> redefine error! java.lang.UnsupportedOperationException: class redefinition failed: attempted to add a method

<!-- more -->

![img](https://img.jbzj.com/file_images/article/202006/202065165602467.png?202055165825)

它提示我们新增加方法，那我们就看看是不是新增加了方法。通过 javap 来查看定义的方法：

这是老的类：

![img](https://img.jbzj.com/file_images/article/202006/202065165602468.jpg?202055165825)

这是新的类：

![img](https://img.jbzj.com/file_images/article/202006/202065165602469.jpg?202055165825)

对比之后发现，新的类，即本地编译的类，其中的 lambda 对应的方法名都是 lambda$getAllCity$0 这样的，最后的编号是从 0 开始的。

而旧的类，即现在在运行的类，其中的同一个 lambda 的方法名是 lambda$getAllCity$121，最后的编号是一个非常大的数字。

在仔细对比下，发现是 jdk 的版本问题，不同的 jdk 版本对与 lamdba 的处理可能不一致。

具体来说，线上编译的 jdk 版本是 1.8.0_66-b17， 而本地是 1.8.0_222-b10，而这两个版本对 lambda 对应的方法命名是不一样的。

首先，为了调试方便，写一个最小复现用例来看看：

```java
// Compile.java
// 编译LamdbaTest1.java和LamdbaTest2.java
import javax.tools.*;
import java.io.File;
public class Compile {
 public static void main(String[] args) {
  String path1 = "/path/to/LamdbaTest1.java";
  String path2 = "/path/to/LamdbaTest2.java";
  JavaCompiler javaCompiler = ToolProvider.getSystemJavaCompiler();
  DiagnosticCollector diagnostics = new DiagnosticCollector();
  StandardJavaFileManager fileManager = javaCompiler.getStandardFileManager(diagnostics, null, null);
  Iterable<? extends JavaFileObject> compilationUnits = fileManager.getJavaFileObjects(
    new File(path1),
    new File(path2)
  );
  JavaCompiler.CompilationTask task = javaCompiler.getTask(null, fileManager, diagnostics, null, null,
    compilationUnits);
  boolean success = task.call();
  System.out.println(success);
 }
}

//LamdbaTest1.java
public class LamdbaTest1 {
 private void test(Runnable runnable) {
  runnable.run();
 }
 private void main() throws Throwable {
  test(() -> {
   System.out.println(11);
  });
 }
}

//LamdbaTest2.java
public class LamdbaTest2 {
 private void test(Runnable runnable) {
  runnable.run();
 }
 private void main() throws Throwable {
  test(() -> {
   System.out.println(22);
  });
 }
}
```

使用 1.8.0_222-b10（新版本 jdk）跑完了之后，发现 LamdbaTest2 中的 lambda 方法是：

![img](https://img.jbzj.com/file_images/article/202006/202065165602470.png?202055165825)

```java
private static void lambda$main$0();
```

而换版本 1.8.0_66-b17（旧版本 jdk）之后，lambda 的方法就成了：

![img](https://img.jbzj.com/file_images/article/202006/202065165602471.jpg?202055165825)

```java
private static void lambda$main$1();
```

多尝试几个文件同时编译，我们就可以发现：对于旧版本的 javac，末尾这个数字是全局递增的，50 个类有 100 个 lambda，那最后一个 lambda 的编号就是 99；而新的版本是每个类重新计数的，和总共多少个类没有关系。

确认了问题之后，接下来就是不断的打断点、重试了。后来发现不同版本的 javac 逻辑确实不同。

首先，查看 jdk 源码可以知道，lambda 的方法名都是：

```java
lambda$<methodname>$<lambdaCount>
```

代码见 `LambdaToMethod.java`

不同的地方在于： 新版本的 javac，在处理一个新的类的时候，会保存上一个 lambdaCount，后续再恢复：

![img](https://img.jbzj.com/file_images/article/202006/202065165602472.jpg?202055165825)

而旧版本则没有这个逻辑：

![img](https://img.jbzj.com/file_images/article/202006/202065165602473.jpg?202055165825)

这就说明旧版本的编译器确实是 lambda 全局编号的。

那，问题来了，这个行为是从哪个版本变掉的呢？

对比之后发现这个变更是 jdk8u74-b02 引入的。对应的 bug 是 https://bugs.openjdk.java.net/browse/JDK-8067422，基本上就是每个类内的 lambda 单独编号，确保编译顺序不会影响 lambda 的方法名字。

所以，解决方案很简单，升级编译环境的 jdk 版本就好。

非常巧合的是，前两天为了更好的适配 Docker 运行环境（通俗的讲，就是在容器内获取到 docker 的 cpu 配额，而不是物理机器的 cpu 数量），我找运维添加了一个新的j dk 版本 1.8.0_231-b11，这样只需要直接将编译环境的 jdk 版本切换到 8u231 就行！

