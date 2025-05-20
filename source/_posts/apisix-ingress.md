---
title: ACK 部署 Apache apisix-ingress-cotroller
date: 2021-01-23 14:37:39
tags:
- Apisix
categories:
- 网关
- Apisix
toc: true
---

## 背景

Ingress 是 Kubernetes 中一个值得关注的模块，作为外部访问 Kubernetes 集群服务的入口，市面上已经有了多种 [Ingress controller](https://kubernetes.io/zh/docs/concepts/services-networking/ingress-controllers/) 的实现。国产实时、高性能的 API 网关 Apache APISIX 推出的 [Apache/apisix-ingress-controller](https://github.com/apache/apisix-ingress-controller) 就是其中一员，作为功能更加强大的 ingress 对外提供服务。笔者准备在阿里云 ACK 集群上部署测试。 

<!-- more -->

## 主题描述

本文主要介绍在阿里云 ACK 部署 apisix-ingress-controller，并且使用 httpbin 测试一个简单的场景。

## 部署拓扑

![img](https://mmbiz.qlogo.cn/mmbiz_png/3ej9lic1DDEGvUsfyfXJJicAQiajss6KjO7r3kK0DfKJwY90uGJlT5uZ3iajcicqialnDG1sZbTOLpBumgRVxyh9S5Lw/0?wx_fmt=png) 

## 依赖项

阿里云的 ACK 集群 ；推荐最低配置：3个 master 节点：CPU 2核  内存 4G2个 worker 节点：CPU 4核  内存 8G

## 安装步骤

### apisix 2.1 release

通过 helm 安装 apisix 2.1 release

```
$ kubectl create ns apisix
$ git clone https://github.com/apache/apisix-helm-chart.git
$ cd ./apisix-helm-chart
$ helm repo add bitnami https://charts.bitnami.com/bitnami
$ helm dependency update ./chart/apisix
$ helm install apisix ./chart/apisix \
  --set gateway.type=LoadBalancer \
  --set allow.ipList="{0.0.0.0/0}" \
  --namespace apisix
```

> tips: etcd 安装时指定 PVC， PVC 在阿里云部署时，需要指定 PV 为云盘， 请在 PVC 的 annotations 中增加：volume.beta.kubernetes.io/storage-class: alicloud-disk-ssd。(关于 PVC 和 PV 的关系请参考[这里](https://kubernetes.io/zh/docs/concepts/storage/persistent-volumes/))

### apisix-ingress-controller

通过 helm 安装 apisix-ingress-controller

```
$ git clone https://github.com/apache/apisix-ingress-controller.git
$ cd ./apisix-ingress-controller
$ helm install ingress-apisix-base -n apisix ./charts/base
$ helm install ingress-apisix ./charts/ingress-apisix \			
  --set ingressController.image.tag=dev \
  --set ingressController.config.apisix.baseURL=http://apisix-admin:9180/apisix/admin \
  --set ingressController.config.apisix.adminKey=edd1c9f034335f136f87ad84b625c8f1 \
  --namespace apisix
```

## 测试

### 检查集群是否部署成功

![img](https://uploader.shimo.im/f/LO0YnRdi4muxnhcy.png) 

![img](https://uploader.shimo.im/f/wCBnC1p2enFZhmDl.png)

### 配置一个简单的路由做测试

```yaml
apiVersion: apisix.apache.org/v1
kind: ApisixRoute
metadata:
  name: httpbin-route
  namespace: apisix
spec:
  rules:
  - host: httpbin.apisix.com
    http:
      paths:
      - backend:
          serviceName: httpbin
          servicePort: 80
        path: /hello*
```

通过 apisix admin api 查看结果，发现路由已经正确配置。

![img](https://uploader.shimo.im/f/x0F4IbzvPkFIpbwK.png)

```yaml
{
    "action": "get",
    "count": "2",
    "header": {
        "revision": "46",
        "cluster_id": "8320356269565269865",
        "raft_term": "2",
        "member_id": "3807956127770623265"
    },
    "node": {
        "key": "/apisix/upstreams",
        "dir": true,
        "modifiedIndex": 27,
        "createdIndex": 3,
        "nodes": [
            {
                "key": "/apisix/upstreams/00000000000000000041",
                "modifiedIndex": 42,
                "value": {
                    "nodes": {
                        "172.20.1.12:80": 100
                    },
                    "type": "roundrobin",
                    "pass_host": "pass",
                    "hash_on": "vars",
                    "desc": "apisix_httpbin_80",
                    "create_time": 1608561159,
                    "update_time": 1608561159
                },
                "createdIndex": 42
            }
        ]
    }
}
```

### 扩容 httpbin
![img](https://uploader.shimo.im/f/oiZhhGJCFm2CVBkN.png)

查看 k8s 中 httpbin

![img](https://uploader.shimo.im/f/L0RmaE5s6W9rX7qZ.png!thumbnail)

查看 apisix 中 httpbin upstream

![img](https://uploader.shimo.im/f/1GlbOwZThCKJ8bwL.png)

```json
// 格式化后
{
    ...
        "nodes": {
            "172.20.1.12:80": 100,
            "172.20.0.198:80": 100,
            "172.20.0.197:80": 100
        },
        "id": "00000000000000000041",
        "key": "/apisix/upstreams/00000000000000000041",
        "desc": "apisix_httpbin_80",
  ...
}
```

## 总结

 本文在 ACK 集群环境依次安装了 Etcd、 Apache APISIX、Apache apisix-ingress-controller，并且使用 httpbin 服务验证 ingress 的基本配置功能，通过 CRD 配置了路由，检测了后端服务在扩缩容时服务注册发现机制。 

另外值得一提的是 apisix-ingress-controller 可以完整的支持 Apache APISIX 提供的所有插件，甚至是自定义插件。功能丰富且扩展能力强，是一款不错的 Ingress 项目。
