---
title:  drools 用户指南 ----stateful session（有状态会话）的使用
date: 2017-04-11 12:37:22
tags: 
- 规则引擎
- drools
categories: 
- 规则引擎
---



## stateful session 有状态会话 ##

有状态会话长期存在，并允许随着时间的推移进行迭代更改。 有状态会话的一些常见用例包括但不限于：
1. 监测
  半自动买入股票市场监控与分析。
2. 诊断
  故障查找，医疗诊断
3. 物流
  包裹跟踪和送货配置
4. 合规
  验证市场交易的合法性。

与无状态会话相反，必须先调用 dispose() 方法，以确保没有内存泄漏，因为 KieBase 包含创建状态知识会话时的引用。 由于状态知识会话是最常用的会话类型，所以它只是在 KIE API 中命名为 KieSession。 KieSession 还支持 BatchExecutor 接口，如 StatelessKieSession，唯一的区别是 FireAllRules 命令在有状态会话结束时不被自动调用。

我们举例说明了用于提高火灾报警器的监控用例。 只使用四个类，我们假设 `Room` 代表房子里的房间，每个 `Room` 都有一个喷头 `Sprinkler`。 如果在房间里发生火灾，我们用一个 `Fire` 实例来表示, 用 `Alarm` 代表警报 。

```java
public class Room {
    private String name
    // getter and setter methods here
}

public class Sprinkler {
    private Room room;
    private boolean on;
    // getter and setter methods here
}

public class Fire {
    private Room room;
    // getter and setter methods here
}

public class Alarm {
}
```

在上一节无状态会话中介绍了插入和匹配数据的概念。 这个例子假设每个对象类型的都是单个实例被插入的，因此只使用了字面约束。 然而，房子有许多房间，因此 `rules` 必须表达实体类之间的关系，例如在某个房间内的喷洒器。 这最好通过使用绑定变量作为模式中的约束来完成。 这种“加入”过程产生了所谓的“cross products”，这在下一节中将会介绍。

<!-- more -->

当发生火灾时，会为该类别创建 Fire 类的实例，并将其插入到会话中。 该规则使用 Fire 对象的房间字段上的绑定来约束与当前关闭的房间的喷水灭火器的匹配。 当此规则触发并且执行结果时，喷头被打开。


```java
rule "When there is a fire turn on the sprinkler"
when
    Fire($room : room)
    $sprinkler : Sprinkler(room == $room, on == false)
then
    modify($sprinkler) {setOn( true) };
    System.out.println("Turn on the sprinkler for room" + $room.getName() );
end
```

而无状态会话使用标准 Java 语法来修改字段，在上述规则中，我们使用 modify 语句，它作为一种“with”语句。 它可以包含一系列逗号分隔的 Java 表达式，即对由 modify 语句的控制表达式选择的对象的 setter 的调用。 这将修改数据，并使引擎意识到这些更改，以便它可以再次对其进行推理。 这个过程被称为推理，对于有状态会话的工作至关重要。 无状态会话通常不使用推理，因此引擎不需要意识到数据的更改。 也可以通过使用顺序模式显式地关闭推理。

到目前为止，我们有规则告诉我们匹配数据是否存在，但是当它不存在时呢？ 我们如何确定火已经熄灭了，即没有 Fire 对象呢？ 以前的约束是根据命题逻辑的句子，其中引擎限制个别的实例。 Drools 还支持 First Order Logic，允许您查看数据集。 当某个不存在时，关键字下的模式不匹配。 一旦这个房间的火灾消失，下面给出的规则会使喷水灭火。

```java
rule "When the fire is gone turn off the sprinkler"
when
    $room : Room( )
    $sprinkler : Sprinkler(room == $room, on == true)
    not Fire(room == $room)
then
    modify($sprinkler) {setOn( false) };
    System.out.println("Turn off the sprinkler for room" + $room.getName() );
end
```

每个 `room` 有一个喷水灭火器，`house` 只有一个警报。 当发生火灾时，会创建一个 `alrm` 对象，而不管发生多少火灾，整个建筑物都只需要一个警报 `alrm`。 

```java
rule "Raise the alarm when we have one or more fires"
when
    exists Fire()
then
    insert(new Alarm() );
    System.out.println("Raise the alarm");
end
```

同样，当没有火灾时，我们想要删除警报，所以可以再次使用 not 关键字。

```java
rule "Cancel the alarm when all the fires have gone"
when
    not Fire()
    $alarm : Alarm()
then
    delete($alarm);
    System.out.println("Cancel the alarm");
end
```

最后，当应用程序首次启动并且在报警消除并且所有喷头已关闭后，都会打印 Everything is ok。

```java
rule "Status output when things are ok"
when
    not Alarm()
    not Sprinkler(on == true) 
then
    System.out.println("Everything is ok");
end
```

正如我们在无状态会话示例中所做的那样，上述规则应放在单个 DRL 文件中，并保存到 Maven 项目或其任何子文件夹的资源文件夹中。 如前所述，我们可以从 KieContainer 获得 KieSession。 唯一的区别是，这次我们创建一个有状态会话，而之前我们创建的是一个无状态会话。

```java
KieServices kieServices = KieServices.Factory.get();
KieContainer kContainer = kieServices.getKieClasspathContainer();
KieSession ksession = kContainer.newKieSession();
```

创建会话后，现在可以随着时间的推移迭代地使用它。 创建和插入四个房间对象，每个房间的对应一个 Sprinkler 对象。 此时，规则引擎已经完成了所有的匹配，但并没有触发。 调用 ksession.fireAllRules（）使得匹配的规则触发，但因为没有火灾，所以输出结果是 Everything is ok。

```java
String[] names = new String[]{"kitchen", "bedroom", "office", "livingroom"};
Map<String,Room> name2room = new HashMap<String,Room>();
for(String name: names){
    Room room = new Room(name);
    name2room.put(name, room);
    ksession.insert(room);
    Sprinkler sprinkler = new Sprinkler(room);
    ksession.insert(sprinkler);
}

ksession.fireAllRules();
```

> Everything is ok

我们现在创造两个 Fire 并插入它们， 随着发动机内部的火灾，一旦调用了 fireAllRules（），报警器就会升高，并且相应的喷水灭火器打开。

```java
Fire kitchenFire = new Fire(name2room.get( "kitchen") );
Fire officeFire = new Fire(name2room.get( "office") );
FactHandle kitchenFireHandle = ksession.insert(kitchenFire);
FactHandle officeFireHandle = ksession.insert(officeFire);

ksession.fireAllRules();
```


> Raise the alarm
> Turn on the sprinkler for room kitchen
> Turn on the sprinkler for room office

一段时间之后，火灾将熄灭，并且 Fire 实例被撤回。 这导致喷头关闭，报警被取消，最后再次打印 Everything is ok。

```java
ksession.delete(kitchenFireHandle);
ksession.delete(officeFireHandle);

ksession.fireAllRules();
```

> Cancel the alarm
> Turn off the sprinkler for room office
> Turn off the sprinkler for room kitchen
> Everything is ok
