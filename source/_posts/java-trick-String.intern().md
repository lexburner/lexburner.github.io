---
title: java trick--String.intern()
date: 2016-11-07 23:16:52
tags: 
- JAVA
categories: 
- JAVA
toc: true
---



《深入理解 java 虚拟机》第二版中对 `String.intern()` 方法的讲解中所举的例子非常有意思

不了解 String.intern() 的朋友要理解他其实也很容易，它返回的是一个字符串在字符串常亮池中的引用。直接看下面的 demo

```java
public class Main {
    public static void main(String[] args) {
        String str1 = new StringBuilder("计算机").append("软件").toString();
        System.out.println(str1.intern() == str1);

<!-- more -->

        String str2 = new StringBuilder("ja").append("va").toString();
        System.out.println(str2.intern() == str2);
    }
}
```
两者输出的结果如下：

```
true
false
```
我用的 jdk 版本为 `Oracle JDK7u45`。简单来说，就是一个很奇怪的现象，为什么 `java` 这个字符串在类加载之前就已经加载到常量池了？

我在知乎找到了具体的说明，如下：

```java
package sun.misc;

import java.io.PrintStream;

public class Version {
    private static final String launcher_name = "java";
    private static final String java_version = "1.7.0_79";
    private static final String java_runtime_name = "Java(TM) SE Runtime Environment";
    private static final String java_runtime_version = "1.7.0_79-b15";
    ...
}
```

而 HotSpot JVM 的实现会在类加载时先调用：

```java
public final class System{
		...
 private static void initializeSystemClass() {
		...
        sun.misc.Version.init();
        ...
    }
	    ...
}
```
原来是 sun.misc.Version 这个类在起作用。

