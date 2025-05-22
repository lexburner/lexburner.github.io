---
title: JAVA 拾遗 -- 关于 SPI 机制
date: 2017-11-09 16:18:51
tags:
- JAVA
categories:
- JAVA
toc: true
---

JDK 提供的 SPI(Service Provider Interface)机制，可能很多人不太熟悉，因为这个机制是针对厂商或者插件的，也可以在一些框架的扩展中看到。其核心类 `java.util.ServiceLoader` 可以在 [jdk1.8](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) 的文档中看到详细的介绍。虽然不太常见，但并不代表它不常用，恰恰相反，你无时无刻不在用它。玄乎了，莫急，思考一下你的项目中是否有用到第三方日志包，是否有用到数据库驱动？其实这些都和 SPI 有关。再来思考一下，现代的框架是如何加载日志依赖，加载数据库驱动的，你可能会对 class.forName("com.mysql.jdbc.Driver")这段代码不陌生，这是每个 java 初学者必定遇到过的，但如今的数据库驱动仍然是这样加载的吗？你还能找到这段代码吗？这一切的疑问，将在本篇文章结束后得到解答。

首先介绍 SPI 机制是个什么东西

<!-- more -->

## 实现一个自定义的 SPI

### 1 项目结构

![SPI 项目结构](https://image.cnkirito.cn/spi_%E9%A1%B9%E7%9B%AE%E7%BB%93%E6%9E%84.png)

1. invoker 是我们的用来测试的主项目。
2. interface 是针对厂商和插件商定义的接口项目，只提供接口，不提供实现。
3. good-printer,bad-printer 分别是两个厂商对 interface 的不同实现，所以他们会依赖于 interface 项目。

这个简单的 demo 就是让大家体验，在不改变 invoker 代码，只更改依赖的前提下，切换 interface 的实现厂商。

### 2 interface 模块

**2.1 moe.cnkirito.spi.api.Printer**

```java
public interface Printer {
    void print();
}
```

interface 只定义一个接口，不提供实现。规范的制定方一般都是比较牛叉的存在，这些接口通常位于 java，javax 前缀的包中。这里的 Printer 就是模拟一个规范接口。

### 3 good-printer 模块

**3.1 good-printer\pom.xml**

```xml
<dependencies>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>interface</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
</dependencies>
```

规范的具体实现类必然要依赖规范接口

**3.2 moe.cnkirito.spi.api.GoodPrinter**

```java
public class GoodPrinter implements Printer {
    public void print() {
        System.out.println("你是个好人 ~");
    }
}
```

作为 Printer 规范接口的实现一

**3.3 resources\META-INF\services\moe.cnkirito.spi.api.Printer**

```
moe.cnkirito.spi.api.GoodPrinter
```

这里需要重点说明，每一个 SPI 接口都需要在自己项目的静态资源目录中声明一个 services 文件，文件名为实现规范接口的类名全路径，在此例中便是 `moe.cnkirito.spi.api.Printer`，在文件中，则写上一行具体实现类的全路径，在此例中便是 `moe.cnkirito.spi.api.GoodPrinter`。

这样一个厂商的实现便完成了。

### 4 bad-printer 模块

我们在按照和 good-printer 模块中定义的一样的方式，完成另一个厂商对 Printer 规范的实现。

**4.1 bad-printer\pom.xml**
```xml
<dependencies>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>interface</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
</dependencies>
```

**4.2 moe.cnkirito.spi.api.BadPrinter**

```java
public class BadPrinter implements Printer {

    public void print() {
        System.out.println("我抽烟，喝酒，蹦迪，但我知道我是好女孩 ~");
    }
}
```

**4.3 resources\META-INF\services\moe.cnkirito.spi.api.Printer**

```
moe.cnkirito.spi.api.BadPrinter
```

这样，另一个厂商的实现便完成了。

**5 invoker 模块 **

这里的 invoker 便是我们自己的项目了。如果一开始我们想使用厂商 good-printer 的 Printer 实现，是需要将其的依赖引入。

```xml
<dependencies>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>interface</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>good-printer</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
</dependencies>
```

**5.1 编写调用主类 **

```java
public class MainApp {


    public static void main(String[] args) {
        ServiceLoader<Printer> printerLoader = ServiceLoader.load(Printer.class);
        for (Printer printer : printerLoader) {
            printer.print();
        }
    }
}
```

ServiceLoader 是 `java.util` 提供的用于加载固定类路径下文件的一个加载器，正是它加载了对应接口声明的实现类。

**5.2 打印结果 1**

```
你是个好人 ~
```

如果在后续的方案中，想替换厂商的 Printer 实现，只需要将依赖更换

```xml
<dependencies>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>interface</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
    <dependency>
        <groupId>moe.cnkirito</groupId>
        <artifactId>bad-printer</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
</dependencies>
```

调用主类无需变更代码，这符合开闭原则

**5.3 打印结果 2**

```
我抽烟，喝酒，蹦迪，但我知道我是好女孩 ~
```

是不是很神奇呢？这一切对于调用者来说都是透明的，只需要切换依赖即可！

## SPI 在实际项目中的应用

先总结下有什么新知识，resources/META-INF/services 下的文件似乎我们之前没怎么接触过，ServiceLoader 也没怎么接触过。那么现在我们打开自己项目的依赖，看看有什么发现。

1. 在 mysql-connector-java-xxx.jar 中发现了 META-INF\services\java.sql.Driver 文件，里面只有两行记录：

   ```
   com.mysql.jdbc.Driver
   com.mysql.fabric.jdbc.FabricMySQLDriver
   ```

   我们可以分析出，`java.sql.Driver` 是一个规范接口，`com.mysql.jdbc.Driver`
   `com.mysql.fabric.jdbc.FabricMySQLDriver` 则是 mysql-connector-java-xxx.jar 对这个规范的实现接口。

2. 在 jcl-over-slf4j-xxxx.jar 中发现了 META-INF\services\org.apache.commons.logging.LogFactory 文件，里面只有一行记录：

   ```
   org.apache.commons.logging.impl.SLF4JLogFactory
   ```

   相信不用我赘述，大家都能理解这是什么含义了

3. 更多的还有很多，有兴趣可以自己翻一翻项目路径下的那些 jar 包

既然说到了数据库驱动，索性再多说一点，还记得一道经典的面试题：class.forName("com.mysql.jdbc.Driver") 到底做了什么事？

先思考下：自己会怎么回答？

都知道 class.forName 与类加载机制有关，会触发执行 com.mysql.jdbc.Driver 类中的静态方法，从而使主类加载数据库驱动。如果再追问，为什么它的静态块没有自动触发？可答：因为数据库驱动类的特殊性质，JDBC 规范中明确要求 Driver 类必须向 DriverManager 注册自己，导致其必须由 class.forName 手动触发，这可以在 java.sql.Driver 中得到解释。完美了吗？还没，来到最新的 DriverManager 源码中，可以看到这样的注释, 翻译如下：

> `DriverManager` 类的方法 `getConnection` 和 `getDrivers` 已经得到提高以支持 Java Standard Edition [Service Provider](http://tool.oschina.net/uploads/apidocs/technotes/guides/jar/jar.html#Service%20Provider) 机制。 JDBC 4.0 Drivers 必须包括 `META-INF/services/java.sql.Driver` 文件。此文件包含 `java.sql.Driver` 的 JDBC 驱动程序实现的名称。例如，要加载 `my.sql.Driver` 类，`META-INF/services/java.sql.Driver` 文件需要包含下面的条目：
>
>  **my.sql.Driver**
>
> 应用程序不再需要使用 `Class.forName()` 显式地加载 JDBC 驱动程序。当前使用 `Class.forName()` 加载 JDBC 驱动程序的现有程序将在不作修改的情况下继续工作。

可以发现，Class.forName 已经被弃用了，所以，这道题目的最佳回答，应当是和面试官牵扯到 JAVA 中的 SPI 机制，进而聊聊加载驱动的演变历史。

**java.sql.DriverManager**

```java
public Void run() {

    ServiceLoader<Driver> loadedDrivers = ServiceLoader.load(Driver.class);
    Iterator<Driver> driversIterator = loadedDrivers.iterator();

    try{
        while(driversIterator.hasNext()) {
            driversIterator.next();
        }
    } catch(Throwable t) {
    // Do nothing
    }
    return null;
}
```

当然那，本节的内容还是主要介绍 SPI，驱动这一块这是引申而出，如果不太理解，可以多去翻一翻 jdk1.8 中 Driver 和 DriverManager 的源码，相信会有不小的收获。

## SPI 在扩展方面的应用

SPI 不仅仅是为厂商指定的标准，同样也为框架扩展提供了一个思路。框架可以预留出 SPI 接口，这样可以在不侵入代码的前提下，通过增删依赖来扩展框架。前提是，框架得预留出核心接口，也就是本例中 interface 模块中类似的接口，剩下的适配工作便留给了开发者。

例如我的上一篇文章 https://www.cnkirito.moe/2017/11/07/spring-cloud-sleuth/ 中介绍的 motan 中 Filter 的扩展，便是采用了 SPI 机制，熟悉这个设定之后再回头去了解一些框架的 SPI 扩展就不会太陌生了。
