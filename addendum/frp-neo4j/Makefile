# El contexto debe indicarse explícitamente para evitar actuar en otro clúster.
KUBE_CONTEXT ?=
KUBECTL = kubectl --context $(KUBE_CONTEXT)
K8S_DIR ?= k8s/homelab
.PHONY: k8s-diff k8s-apply k8s-status k8s-logs
check-context:
	@test -n "$(KUBE_CONTEXT)" || { echo "Indica KUBE_CONTEXT=<contexto>"; exit 1; }
k8s-diff: check-context
	$(KUBECTL) diff -k $(K8S_DIR)
k8s-apply: check-context
	$(KUBECTL) apply -k $(K8S_DIR)
	$(KUBECTL) -n frp rollout status deploy/frps --timeout=180s
k8s-status: check-context
	$(KUBECTL) -n frp get deployment,pods -o wide
k8s-logs: check-context
	$(KUBECTL) -n frp logs deploy/frps --tail=100

# Conserva el namespace y la configuración; sólo para el servidor frp.
k8s-delete: check-context
	$(KUBECTL) -n frp delete deployment/frps --ignore-not-found
