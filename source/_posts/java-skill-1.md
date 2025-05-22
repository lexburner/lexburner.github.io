---
title: java 小技巧 (一)-- 远程 debug
date: 2017-10-25 17:24:48
tags:
- JAVA
categories:
- JAVA
toc: true
---

该系列介绍一些 java 开发中常用的一些小技巧，多小呢，从不会到会只需要一篇文章这么小。这一篇介绍如何使用 jdk 自带的扩展包配合 Intellij IDEA 实现远程 debug。

项目中经常会有出现这样的问题，会令程序员抓狂：关键代码段没有打印日志，本地环境正常生产环境却又问题... 这时候，远程 debug 可能会启动作用。

## 1 准备用于 debug 的代码

准备一个 RestController 用于接收请求，最后可以通过本地断点验证是否成功开启了远程 debug

<!-- more -->

```java
@RestController
public class TestController {

    @RequestMapping("/test")
    public Integer test() {
        int i = 0;
        i++;
        i++;
        i++;
        i++;
        i++;
        return i;
    }

}
```

项目使用 springboot 和 maven 构建，依赖就省略了，使用 springboot 提供的 maven 打包插件，方便我们打包成可运行的 jar。

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <executable>true</executable>
            </configuration>
        </plugin>
        <plugin>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
                <source>1.8</source>
                <target>1.8</target>
            </configuration>
        </plugin>
    </plugins>
</build>
```

## 2 使用 maven 插件打包成 jar

![maven 插件](https://image.cnkirito.cn/maven_install.png)

## 3 准备启动脚本

```shell
java -jar -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=64057 remote-debug-1.0-SNAPSHOT.jar
```

1. 使用 java -jar 的方式启动程序，并且添加了一串特殊的参数，这是我们能够开启远程 debug 的关键，以 `-` 开头的参数是 jvm 的标准启动参数，关于 jvm 启动参数相关的知识可以先去其他博客了解。
2. -agentlib:libname[=options], 用于装载本地 lib 包。在这条指令中便是加载了 jdwp(Java Debug Wire Protocol) 这个用于远程调试 java 的扩展包。而 `transport=dt_socket,server=y,suspend=n,address=64057` 这些便是 jdwp 装载时的定制参数，详细的参数作用可以搜索 jdwp 进行了解。我们需要关心的只有 address=64057 这个参数选项，本地调试程序使用 64057 端口与其通信，从而远程调试。

## 4 配置 IDEA

![IDEA 配置](https://image.cnkirito.cn/%E8%BF%9C%E7%A8%8Bdebug_idea%E9%85%8D%E7%BD%AE.png)

1. 与脚本中的指令完全一致
2. 远程 jar 包运行的 host，由于我的 jar 运行在本地，所以使用的是 localhost，一般线上环境自然是修改为线上的地址
3. 与远程 jar 包进行交互的端口号，idea 会根据指令自动帮我们输入
4. 选择与远程 jar 包一致的本地代码

** 请务必保证远程 jar 包的代码与本地代码一致！！！**

## 5 验证

保存第 4 步的配置后，先执行脚本让远程的 jar 包跑起来，再在 IDEA 中运行 remote-debug

![运行 remote-jar](https://image.cnkirito.cn/%E8%BF%90%E8%A1%8Cremote.png)

如上便代表连接运行成功了

在本地打上断点，访问 `localhost:8080/test`

![远程 debug 信息展示](https://image.cnkirito.cn/debug%E4%BF%A1%E6%81%AF%E5%B1%95%E7%A4%BA.png)

可以在本地看到堆栈信息，大功告成。一行指令便完成了远程调试。
