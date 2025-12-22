---
title: 深入理解 RPC 之动态代理篇
date: 2017-12-15 20:16:28
tags: 
- RPC
categories:
  - 微服务
toc: true
---

提到 JAVA 中的动态代理，大多数人都不会对 JDK 动态代理感到陌生，Proxy，InvocationHandler 等类都是 J2SE 中的基础概念。动态代理发生在服务调用方 / 客户端，RPC 框架需要解决的一个问题是：像调用本地接口一样调用远程的接口。于是如何组装数据报文，经过网络传输发送至服务提供方，屏蔽远程接口调用的细节，便是动态代理需要做的工作了。RPC 框架中的代理层往往是单独的一层，以方便替换代理方式（如 motan 代理层位于 `com.weibo.api.motan.proxy` ，dubbo 代理层位于 `com.alibaba.dubbo.common.bytecode` ）。

实现动态代理的方案有下列几种：

- jdk 动态代理
- cglib 动态代理
- javassist 动态代理
- ASM 字节码
- javassist 字节码

<!-- more -->

其中 cglib 底层实现依赖于 ASM，javassist 自成一派。由于 ASM 和 javassist 需要程序员直接操作字节码，导致使用门槛相对较高，但实际上他们的应用是非常广泛的，如 Hibernate 底层使用了 javassist（默认）和 cglib，Spring 使用了 cglib 和 jdk 动态代理。

RPC 框架无论选择何种代理技术，所需要完成的任务其实是固定的，不外乎‘整理报文’，‘确认网络位置’，‘序列化’,'网络传输'，‘反序列化’，'返回结果'...

## 技术选型的影响因素

框架中使用何种动态代理技术，影响因素也不少。

### 性能

从早期 dubbo 的作者梁飞的博客 http://javatar.iteye.com/blog/814426 中可以得知 dubbo 选择使用 javassist 作为动态代理方案主要考虑的因素是 ** 性能 **。

从其博客的测试结果来看 javassist > cglib > jdk 。但实际上他的测试过程稍微有点瑕疵：在 cglib 和 jdk 代理对象调用时，走的是反射调用，而在 javassist 生成的代理对象调用时，走的是直接调用（可以先阅读下梁飞大大的博客）。这意味着 cglib 和 jdk 慢的原因并不是由动态代理产生的，而是由反射调用产生的（顺带一提，很多人认为 jdk 动态代理的原理是反射，其实它的底层也是使用的字节码技术）。而最终我的测试结果，结论如下： javassist ≈ cglib > jdk 。javassist 和 cglib 的效率基本持平 ，而他们两者的执行效率基本可以达到 jdk 动态代理的 2 倍（这取决于测试的机器以及 jdk 的版本，jdk1.8 相较于 jdk1.6 动态代理技术有了质的提升，所以并不是传闻中的那样：cglib 比 jdk 快 10 倍）。文末会给出我的测试代码。

### 依赖

> motan 默认的实现是 jdk 动态代理，代理方案支持 SPI 扩展，可以自行扩展其他实现方式。
>
> 使用 jdk 做为默认，主要是减少 core 包依赖，性能不是唯一考虑因素。另外使用字节码方式 javaassist 性能比较优秀，动态代理模式下 jdk 性能也不会差多少。
>
> -- **rayzhang0603**(motan 贡献者)

motan 选择使用 jdk 动态代理，原因主要有两个：减少 motan-core 的依赖，方便。至于扩展性，dubbo 并没有预留出动态代理的扩展接口，而是写死了 bytecode ，这点上 motan 做的较好。

### 易用性

从 dubbo 和 motan 的源码中便可以直观的看出两者的差距了，dubbo 为了使用 javassist 技术花费不少的精力，而 motan 使用 jdk 动态代理只用了一个类。dubbo 的设计者为了追求极致的性能而做出的工作是值得肯定的，motan 也预留了扩展机制，两者各有千秋。

## 动态代理入门指南

为了方便对比几种动态代理技术，先准备一个统一接口。

```java
public interface BookApi {
    void sell();
}
```

### JDK 动态代理

```java
private static BookApi createJdkDynamicProxy(final BookApi delegate) {
        BookApi jdkProxy = (BookApi) Proxy.newProxyInstance(ClassLoader.getSystemClassLoader(),
                new Class[]{BookApi.class}, new JdkHandler(delegate));
        return jdkProxy;
}

private static class JdkHandler implements InvocationHandler {

        final Object delegate;

        JdkHandler(Object delegate) {
            this.delegate = delegate;
        }

        @Override
        public Object invoke(Object object, Method method, Object[] objects)
                throws Throwable {
            // 添加代理逻辑 <1>
            if(method.getName().equals("sell")){
                System.out.print("");
            }
            return null;
//            return method.invoke(delegate, objects);
        }

```

<1> 在真正的 RPC 调用中 ，需要填充‘整理报文’，‘确认网络位置’，‘序列化’,'网络传输'，‘反序列化’，'返回结果' 等逻辑。

### Cglib 动态代理

```java
private static BookApi createCglibDynamicProxy(final BookApi delegate) throws Exception {
        Enhancer enhancer = new Enhancer();
        enhancer.setCallback(new CglibInterceptor(delegate));
        enhancer.setInterfaces(new Class[]{BookApi.class});
        BookApi cglibProxy = (BookApi) enhancer.create();
        return cglibProxy;
    }

    private static class CglibInterceptor implements MethodInterceptor {

        final Object delegate;

        CglibInterceptor(Object delegate) {
            this.delegate = delegate;
        }

        @Override
        public Object intercept(Object object, Method method, Object[] objects,
                                MethodProxy methodProxy) throws Throwable {
            // 添加代理逻辑
            if(method.getName().equals("sell")) {
                System.out.print("");
            }
            return null;
//            return methodProxy.invoke(delegate, objects);
        }
    }
```

和 JDK 动态代理的操作步骤没有太大的区别，只不过是替换了 cglib 的 API 而已。

需要引入 cglib 依赖：

```xml
<dependency>
    <groupId>cglib</groupId>
    <artifactId>cglib</artifactId>
    <version>3.2.5</version>
</dependency>
```

### Javassist 字节码

到了 javassist，稍微有点不同了。因为它是通过直接操作字节码来生成代理对象。

```java
private static BookApi createJavassistBytecodeDynamicProxy() throws Exception {
    ClassPool mPool = new ClassPool(true);
    CtClass mCtc = mPool.makeClass(BookApi.class.getName() + "JavaassistProxy");
    mCtc.addInterface(mPool.get(BookApi.class.getName()));
    mCtc.addConstructor(CtNewConstructor.defaultConstructor(mCtc));
    mCtc.addMethod(CtNewMethod.make(
            "public void sell(){ System.out.print(\"\") ; }", mCtc));
    Class<?> pc = mCtc.toClass();
    BookApi bytecodeProxy = (BookApi) pc.newInstance();
    return bytecodeProxy;
}
```

需要引入 javassist 依赖：

```xml
<dependency>
    <groupId>org.javassist</groupId>
    <artifactId>javassist</artifactId>
    <version>3.21.0-GA</version>
</dependency>
```

## 动态代理测试

测试环境：window i5 8g jdk1.8 cglib3.2.5 javassist3.21.0-GA

动态代理其实分成了两步：代理对象的创建，代理对象的调用。坊间流传的动态代理性能对比主要指的是后者；前者一般不被大家考虑，如果远程 Refer 的对象是单例的，其只会被创建一次，而如果是原型模式，多例对象的创建其实也是性能损耗的一个考虑因素（只不过远没有调用占比大）。

> Create JDK Proxy: 21 ms
>
> Create CGLIB Proxy: 342 ms
>
> Create Javassist Bytecode Proxy: 419 ms

可能出乎大家的意料，JDK 创建动态代理的速度比后两者要快 10 倍左右。

下面是调用速度的测试：

> case 1:
>
> JDK Proxy invoke cost 1912 ms
>
> CGLIB Proxy invoke cost 1015 ms
>
> JavassistBytecode Proxy invoke cost 1280 ms

> case 2:
>
> JDK Proxy invoke cost 1747 ms
>
> CGLIB Proxy invoke cost 1234 ms
>
> JavassistBytecode Proxy invoke cost 1175 ms

> case 3:
>
> JDK Proxy invoke cost 2616 ms
>
> CGLIB Proxy invoke cost 1373 ms
>
> JavassistBytecode Proxy invoke cost 1335 ms

Jdk 的执行速度一定会慢于 Cglib 和 Javassist，但最慢也就 2 倍，并没有达到数量级的差距；Cglib 和 Javassist 不相上下，差距不大（测试中偶尔发现 Cglib 实行速度会比平时慢 10 倍，不清楚是什么原因）

所以出于易用性和性能，私以为使用 Cglib 是一个很好的选择（性能和 Javassist 持平，易用性和 Jdk 持平）。

## 反射调用

既然提到了动态代理和 cglib ，顺带提一下反射调用如何加速的问题。RPC 框架中在 Provider 服务端需要根据客户端传递来的 className + method + param 来找到容器中的实际方法执行反射调用。除了反射调用外，还可以使用 Cglib 来加速。

### JDK 反射调用

```java
Method method = serviceClass.getMethod(methodName, new Class[]{});
method.invoke(delegate, new Object[]{});
```

### Cglib 调用

```java
FastClass serviceFastClass = FastClass.create(serviceClass);
FastMethod serviceFastMethod = serviceFastClass.getMethod(methodName, new Class[]{});
serviceFastMethod.invoke(delegate, new Object[]{});
```

但实测效果发现 Cglib 并不一定比 JDK 反射执行速度快，还会跟具体的方法实现有关 (大雾)。

## 测试代码

略长...

```java
public class Main {

    public static void main(String[] args) throws Exception {

        BookApi delegate = new BookApiImpl();
        long time = System.currentTimeMillis();
        BookApi jdkProxy = createJdkDynamicProxy(delegate);
        time = System.currentTimeMillis() - time;
        System.out.println("Create JDK Proxy:" + time + "ms");

        time = System.currentTimeMillis();
        BookApi cglibProxy = createCglibDynamicProxy(delegate);
        time = System.currentTimeMillis() - time;
        System.out.println("Create CGLIB Proxy:" + time + "ms");

        time = System.currentTimeMillis();
        BookApi javassistBytecodeProxy = createJavassistBytecodeDynamicProxy();
        time = System.currentTimeMillis() - time;
        System.out.println("Create JavassistBytecode Proxy:" + time + "ms");

        for (int i = 0; i < 10; i++) {
            jdkProxy.sell();//warm
        }
        long start = System.currentTimeMillis();
        for (int i = 0; i < 10000000; i++) {
            jdkProxy.sell();
        }
        System.out.println("JDK Proxy invoke cost" + (System.currentTimeMillis() - start)+ "ms");

        for (int i = 0; i < 10; i++) {
            cglibProxy.sell();//warm
        }
        start = System.currentTimeMillis();
        for (int i = 0; i < 10000000; i++) {
            cglibProxy.sell();
        }
        System.out.println("CGLIB Proxy invoke cost" + (System.currentTimeMillis() - start)+ "ms");

        for (int i = 0; i < 10; i++) {
            javassistBytecodeProxy.sell();//warm
        }
        start = System.currentTimeMillis();
        for (int i = 0; i < 10000000; i++) {
            javassistBytecodeProxy.sell();
        }
        System.out.println("JavassistBytecode Proxy invoke cost" + (System.currentTimeMillis() - start)+ "ms");

        Class<?> serviceClass = delegate.getClass();
        String methodName = "sell";
        for (int i = 0; i < 10; i++) {
            cglibProxy.sell();//warm
        }
        // 执行反射调用
        for (int i = 0; i < 10; i++) {//warm
            Method method = serviceClass.getMethod(methodName, new Class[]{});
            method.invoke(delegate, new Object[]{});
        }
        start = System.currentTimeMillis();
        for (int i = 0; i < 10000000; i++) {
            Method method = serviceClass.getMethod(methodName, new Class[]{});
            method.invoke(delegate, new Object[]{});
        }
        System.out.println("反射 invoke cost" + (System.currentTimeMillis() - start)+ "ms");

        // 使用 CGLib 执行反射调用
        for (int i = 0; i < 10; i++) {//warm
            FastClass serviceFastClass = FastClass.create(serviceClass);
            FastMethod serviceFastMethod = serviceFastClass.getMethod(methodName, new Class[]{});
            serviceFastMethod.invoke(delegate, new Object[]{});
        }
        start = System.currentTimeMillis();
        for (int i = 0; i < 10000000; i++) {
            FastClass serviceFastClass = FastClass.create(serviceClass);
            FastMethod serviceFastMethod = serviceFastClass.getMethod(methodName, new Class[]{});
            serviceFastMethod.invoke(delegate, new Object[]{});
        }
        System.out.println("CGLIB invoke cost" + (System.currentTimeMillis() - start)+ "ms");

    }

    private static BookApi createJdkDynamicProxy(final BookApi delegate) {
        BookApi jdkProxy = (BookApi) Proxy.newProxyInstance(ClassLoader.getSystemClassLoader(),
                new Class[]{BookApi.class}, new JdkHandler(delegate));
        return jdkProxy;
    }

    private static class JdkHandler implements InvocationHandler {

        final Object delegate;

        JdkHandler(Object delegate) {
            this.delegate = delegate;
        }

        @Override
        public Object invoke(Object object, Method method, Object[] objects)
                throws Throwable {
            // 添加代理逻辑
            if(method.getName().equals("sell")){
                System.out.print("");
            }
            return null;
//            return method.invoke(delegate, objects);
        }
    }

    private static BookApi createCglibDynamicProxy(final BookApi delegate) throws Exception {
        Enhancer enhancer = new Enhancer();
        enhancer.setCallback(new CglibInterceptor(delegate));
        enhancer.setInterfaces(new Class[]{BookApi.class});
        BookApi cglibProxy = (BookApi) enhancer.create();
        return cglibProxy;
    }

    private static class CglibInterceptor implements MethodInterceptor {

        final Object delegate;

        CglibInterceptor(Object delegate) {
            this.delegate = delegate;
        }

        @Override
        public Object intercept(Object object, Method method, Object[] objects,
                                MethodProxy methodProxy) throws Throwable {
            // 添加代理逻辑
            if(method.getName().equals("sell")) {
                System.out.print("");
            }
            return null;
//            return methodProxy.invoke(delegate, objects);
        }
    }

    private static BookApi createJavassistBytecodeDynamicProxy() throws Exception {
        ClassPool mPool = new ClassPool(true);
        CtClass mCtc = mPool.makeClass(BookApi.class.getName() + "JavaassistProxy");
        mCtc.addInterface(mPool.get(BookApi.class.getName()));
        mCtc.addConstructor(CtNewConstructor.defaultConstructor(mCtc));
        mCtc.addMethod(CtNewMethod.make(
                "public void sell(){ System.out.print(\"\") ; }", mCtc));
        Class<?> pc = mCtc.toClass();
        BookApi bytecodeProxy = (BookApi) pc.newInstance();
        return bytecodeProxy;
    }

}
```
