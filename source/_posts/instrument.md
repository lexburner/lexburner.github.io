---
title: JAVA 拾遗--Instrument 机制
date: 2018-02-04 22:18:51
tags:
- JAVA
categories:
- JAVA
---

最近在研究 skywalking，发现其作为一个 APM 框架，比起作为 trace 框架的 zipkin 多了一个监控维度：对 JVM 的监控。而 skywalking 集成进系统的方式也和传统的框架不太一样，由于其需要对 JVM 进行无侵入式的监控，所以借助了 JAVA5 提供的 Instrument 机制。关于“Instrument”这个单词，没找到准确的翻译，个人理解为“增强，装配”。

如果我们想要无侵入式的修改一个方法，大多数人想到的可能是 AOP 技术，Instrument 有异曲同工之处，它可以对方法进行增强，甚至替换整个类。

下面借助一个 demo，了解下 Instrument 是如何使用的。第一个 demo 很简单，在某一方法调用时，额外打印出其调用时的时间。

```java
public class Dog {
    public String hello() {
        return "wow wow~";
    }
}
```

```java
public class Main {

    public static void main(String[] args) {
        System.out.println(new Dog().hello());
    }

}
```

Dog 存在一个 hello 方法，希望在调用该方法时打印出是什么时刻发生的调用。

## 实现 Agent

**GreetingTransformer**

```java
public class GreetingTransformer implements ClassFileTransformer {

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined, ProtectionDomain protectionDomain, byte[] classfileBuffer) throws IllegalClassFormatException {
        if ("moe/cnkirito/agent/Dog".equals(className)) {
            System.out.println("Dog's method invoke at\t" + new Date());
        }
        return null;
    }
}
```

对类进行装配的第一步是编写一个 GreetingTransformer 类，其继承自：java.lang.instrument.ClassFileTransformer，打印语句便编写在其中。对于入参和返参我们先不去纠结，因为仅仅完成这么一个简单的 AOP 功能，还不需要了解它们。

**GreetingAgent**

除了上述的 Transformer，我们还需要有一个容器去加载它。

```java
public class GreetingAgent {
    public static void premain(String options, Instrumentation ins) {
        if (options != null) {
            System.out.printf("  I've been called with options: \"%s\"\n", options);
        }
        else
            System.out.println("  I've been called with no options.");
        ins.addTransformer(new GreetingTransformer());
    }
}
```

GreetingAgent 便是我们后面要用的代理，可以发现它只有一个 premain 方法，很简单很形象，它和 main 方法真的很像

```java
public static void main(String[] args) {
}
```

不同的是 main 函数的参数是一个 string[]，而 premain 的入参是一个 String 和一个 Instrumentation。

前者不用过多赘述，而后者 Instrumentation 便是 JAVA5 的 Instrument 机制的核心，它负责为类添加 ClassFileTransformer 的实现，从而对类进行装配。注意 premain 和它的两个参数不能随意修改，为啥？我们使用 main 函数的时候也没问为啥一定是 public static void main(String[] args) 啊，规定！规定！从premain 的命名也可以看出，它的运行显然是在 main 函数之前的。

**MANIFEST.MF**

我们最终会把上面的 GreetingTransformer 和 GreetingAgent 打成一个 jar 包，然后让 Main 函数在启动时加载，但想要使用这个 jar 包还得额外做的工作。

我们得告诉 JVM 在哪儿加载我们的 premain 方法，所以需要在 classpath 下增加一个 resources\META-INF\MANIFEST.MF 文件

```makefile
Manifest-Version: 1.0
Premain-Class: moe.cnkirito.agent.GreetingAgent
Can-Redefine-Classes: true
```

**MAVEN 插件**

为了打包 agent 我们需要额外添加 maven 插件，将 mf 文件和两个类一起打包

```xml
<build>
    <finalName>agent</finalName>

    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-jar-plugin</artifactId>
            <version>2.3.1</version>
            <configuration>
                <archive>
                    <manifestFile>src/main/resources/META-INF/MANIFEST.MF</manifestFile>
                </archive>
            </configuration>
        </plugin>

        <plugin>
            <artifactId>maven-assembly-plugin</artifactId>
            <configuration>
                <outputDirectory>${basedir}</outputDirectory>
                <archive>
                    <index>true</index>
                    <manifest>
                        <addClasspath>true</addClasspath>
                    </manifest>
                    <manifestEntries>
                        <Premain-Class>moe.cnkirito.agent.GreetingAgent</Premain-Class>
                    </manifestEntries>
                </archive>
                <descriptorRefs>
                    <descriptorRef>jar-with-dependencies</descriptorRef>
                </descriptorRefs>
            </configuration>
        </plugin>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
                <source>1.8</source>
                <target>1.8</target>
            </configuration>
        </plugin>
    </plugins>
</build>
```

完成上述的配置，使用 maven install 即可得到一个 agent.jar，到这儿一切的准备工作就完成了。

## 使用代理运行 Main 方法

如果不使用代理运行 Main 方法，毫无疑问我们只会得到一行 `wow wow~`。

如果你使用的 IDEA，eclipse，只需要添加一行启动参数即可：

![启动参数](http://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720180204235047.png)

-javaagent:jar_path=[options] 其中的 jar_path 为 agent.jar 的路径，options 是一个可选参数，其值会被 premain 方法的第一个参数接收 public static void premain(String options, Instrumentation ins).

当需要装配多个 agent.jar 时，重复书写多次即可 -javaagent:C:\Users\xujingfeng\Desktop\agent.jar=hello -javaagent:C:\Users\xujingfeng\Desktop\agent.jar=hello2 ...

运行 Main.jar 的话就是这样的形式：java -javaagent:C:\Users\xujingfeng\Desktop\agent.jar=hello Main

**运行结果**

```
  I've been called with options: "hello"
Dog's method invoke at	Sun Feb 04 23:54:45 CST 2018
wow wow~
```

I've been called with options: "hello" 代表我们的 premain 已经装载成功，并且正确接收到了启动参数。第二行语句也正常打印出了调用时间，至此便完成了 Dog 的装配。

## Instrument 进阶

什么？为了打印一行调用时间，我们花了这么大精力，这是要跟自己过不去吗？你可能会有这样的疑惑，但请不要质疑 Instrument 的价值。

```java
public interface ClassFileTransformer {
    byte[] transform(  ClassLoader         loader,
                String              className,
                Class<?>            classBeingRedefined,
                ProtectionDomain    protectionDomain,
                byte[]              classfileBuffer)
        throws IllegalClassFormatException;
}
```
ClassFileTransformer 可以对所有的方法进行拦截，看见返回值 byte[] 了没有

> The implementation of this method may transform the supplied class file and return a new replacement class file.
>
> 这个方法的实现可能会改变提供的类文件并返回一个新的替换类文件。

这给了我们足够的操作自由度，我们甚至可以替换一个类的实现，只要你能够返回一个正确的替换类。ClassLoader 代表被转换类的类加载器，如果是 bootstrap loader 则可以省略，className 代表全类名，注意是以 `/`作为分隔符。其他参数我也不是太懂，想深究的同学自行翻看下文档。byte[] 代表被转换后的类的字节，为 null 则代表不转换。

### 替换 Dog 的实现

```java
public class Dog {
    public String hello() {
        return "miao miao~";
    }
}
```

注意，这里我修改了 Dog 的实现，不是打印 wow wow~ 而是 miao miao ~，只是为了得到新 Dog 的字节码 Dog.class。我将新的 Dog.class 丢在了我的桌面方便加载：C:/Users/xujingfeng/Desktop

```java
public class DogTransformer implements ClassFileTransformer {

    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined, ProtectionDomain protectionDomain, byte[] classfileBuffer) throws IllegalClassFormatException {
        System.out.println("className: " + className);
        if (!className.equalsIgnoreCase("moe/cnkirito/agent/Dog")) {
            return null;
        }
        return getBytesFromFile("C:/Users/xujingfeng/Desktop/Dog.class");//新的 Dog
//        return getBytesFromFile("app/target/classes/moe/cnkirito/agent/Dog.class");
    }

    public static byte[] getBytesFromFile(String fileName) {
        File file = new File(fileName);
        try (InputStream is = new FileInputStream(file)) {
            // precondition

            long length = file.length();
            byte[] bytes = new byte[(int) length];

            // Read in the bytes
            int offset = 0;
            int numRead = 0;
            while (offset <bytes.length
                    && (numRead = is.read(bytes, offset, bytes.length - offset)) >= 0) {
                offset += numRead;
            }

            if (offset < bytes.length) {
                throw new IOException("Could not completely read file "
                        + file.getName());
            }
            is.close();
            return bytes;
        } catch (Exception e) {
            System.out.println("error occurs in _ClassTransformer!"
                    + e.getClass().getName());
            return null;
        }
    }

}
```

return getBytesFromFile("C:/Users/xujingfeng/Desktop/Dog.class") 一行返回了新的 Dog 试图替换原先的 Dog。注意，这一切都放生在 Agent.jar 之中，我并没有对 Main 函数（也就是我们自己的源代码）做任何改动。

**控制台输出**

```
miao miao~
```

替换成功！我们并没有对 Main 程序的 Dog 做任何修改，只是加载了一个新的 Dog.class 替换了 Main 程序中的 Dog。

### 统计方法运行耗时

这个需求有点接近我们研究 Instrument 的初衷了，统计方法的运行耗时。由于代码的篇幅问题，在本文中只给出思路，详细的实现，可以参考文末的 github 链接，本文的三个例子：

1. 打印 hello 
2.  替换 Dog 
3. 统计方法运行耗时

代码都在其中。

思路：对每个需要统计耗时的方法替换字节码，在方法开始前插入开始时间，在方法结束时插入结束时间，计算差值，more 你可以连同 methodName 和耗时一起发送出去，给 collector 统一采集...wait，这不就是一个简易的监控吗?!~

运行结果：

```
Call to method hello_timing took 1 ms.
wow wow~
```

## JAVA6 的 agentmain  

值得一提的是，java6 提供了 public static void agentmain (String agentArgs, Instrumentation inst); 这个新的方法，可以在 main 函数之后装配（premain 是在 main 之前），这使得操控现有程序的自由度变得更高了，有兴趣的朋友可以去了解下 premain 和 agentmain 的特性。

## 本文示例代码

https://github.com/lexburner/java5-Instrumentation-demo

## 参考资料

[Java 5 特性 Instrumentation 实践](https://www.ibm.com/developerworks/cn/java/j-lo-instrumentation/)

[Java SE 6 的新特性：虚拟机启动后的动态 instrument](https://www.ibm.com/developerworks/cn/java/j-lo-jse61/index.html)

[芋道源码](https://github.com/YunaiV/learning/tree/master/javaagent01)